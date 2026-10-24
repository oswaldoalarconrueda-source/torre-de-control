-- Torre de Control: usuarios, permisos (RLS) y funciones de KPIs.
-- Reglas de negocio: docs/reglas-negocio.md y la skill "skill-para-mierdero-a-lo-que-de".

-- ───────────────────────── Usuarios y permisos ─────────────────────────

create table public.app_usuarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nombre text,
  rol text not null default 'empleado' check (rol in ('owner', 'socio', 'empleado')),
  creado_en timestamptz not null default now()
);

-- Qué cuentas Effi ve cada usuario y qué módulos (los socios ven todos los módulos de sus cuentas).
create table public.app_permisos (
  user_id uuid not null references public.app_usuarios(user_id) on delete cascade,
  cuenta text not null references public.effi_accounts(slug) on delete cascade,
  modulos text[] not null default array['resumen', 'guias', 'novedades', 'dinero'],
  primary key (user_id, cuenta)
);

alter table public.app_usuarios enable row level security;
alter table public.app_permisos enable row level security;

-- El primer usuario que se registra queda como dueño; los demás entran sin acceso hasta que el dueño se lo dé.
create function public.app_nuevo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.app_usuarios (user_id, email, rol)
  values (new.id, new.email,
    case when exists (select 1 from public.app_usuarios where rol = 'owner') then 'empleado' else 'owner' end);
  return new;
end $$;
create trigger app_nuevo_usuario after insert on auth.users
for each row execute function public.app_nuevo_usuario();

create function public.app_es_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_usuarios where user_id = (select auth.uid()) and rol = 'owner');
$$;

create function public.app_puede_ver(p_cuenta text, p_modulo text default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.app_es_owner() or exists (
    select 1 from public.app_permisos p join public.app_usuarios u using (user_id)
    where p.user_id = (select auth.uid()) and p.cuenta = p_cuenta
      and (u.rol = 'socio' or p_modulo is null or p_modulo = any (p.modulos)));
$$;

create policy app_usuarios_ver on public.app_usuarios for select to authenticated
  using (user_id = (select auth.uid()) or public.app_es_owner());
create policy app_usuarios_owner on public.app_usuarios for update to authenticated
  using (public.app_es_owner()) with check (public.app_es_owner());
create policy app_permisos_ver on public.app_permisos for select to authenticated
  using (user_id = (select auth.uid()) or public.app_es_owner());
create policy app_permisos_owner on public.app_permisos for all to authenticated
  using (public.app_es_owner()) with check (public.app_es_owner());

-- Datos de Effi: por cuenta; el dinero (wallet) exige además el módulo "dinero".
create policy ver on public.effi_accounts for select to authenticated using (public.app_puede_ver(slug));
create policy ver on public.effi_guias for select to authenticated using (public.app_puede_ver(cuenta));
create policy ver on public.effi_guia_estados for select to authenticated using (public.app_puede_ver(cuenta));
create policy ver on public.effi_novedades for select to authenticated using (public.app_puede_ver(cuenta, 'novedades'));
create policy ver on public.effi_wallet for select to authenticated using (public.app_puede_ver(cuenta, 'dinero'));
create policy ver on public.effi_sync_state for select to authenticated using (public.app_es_owner());
create policy ver on public.effi_sync_jobs for select to authenticated using (public.app_es_owner());
create policy ver on public.effi_sync_runs for select to authenticated using (public.app_es_owner());
create policy ver on public.effi_webhook_events for select to authenticated using (public.app_es_owner());

-- ───────────────────────── Catálogos y vista base ─────────────────────────

-- Estado global Effi → estado unificado (docs/reglas-negocio.md §1).
create function public.effi_estado_unificado(p_est int) returns text
language sql immutable set search_path = '' as $$
  select case p_est
    when 4 then 'ENTREGADO' when 5 then 'DEVOLUCION'
    when 2 then 'EN_TRANSITO' when 8 then 'EN_TRANSITO'
    when 3 then 'NOVEDAD' when 1 then 'PENDIENTE' when 9 then 'EN_OFICINA'
    when 6 then 'INDEMNIZACION' when 7 then 'EXCLUIDA'
    else 'PENDIENTE' end;
$$;

-- Tipo de movimiento de wallet → línea del PyG / caja.
create function public.effi_linea_wallet(p_t int) returns text
language sql immutable set search_path = '' as $$
  select case p_t
    when 1 then 'Recaudo de venta'
    when 20 then 'Indemnizaciones' when 21 then 'Indemnizaciones'
    when 34 then 'Crédito revertido'
    when 13 then 'Costo de mercancía'
    when 7 then 'Flete con recaudo' when 8 then 'Flete sin recaudo' when 9 then 'Flete devolución'
    when 12 then 'Fulfillment'
    when 15 then 'Otros (4xmil)'
    when 35 then 'Débito revertido'
    when 18 then 'Retiros' when 31 then 'Retiros' when 36 then 'Retiros'
    else 'Otros' end;
$$;

create function public.effi_grupo_wallet(p_t int) returns text
language sql immutable set search_path = '' as $$
  select case when p_t in (18, 31, 36) then 'caja'
              when p_t in (1, 20, 21, 34) then 'ingreso'
              else 'egreso' end;
$$;

-- Guía con su estado efectivo (el wallet manda), fecha local y recaudo acreditado.
-- security_invoker: respeta los permisos (RLS) de quien consulta.
create view public.v_guias with (security_invoker = true) as
select
  g.*,
  a.pais, a.nombre as nombre_cuenta,
  (g.fecha_trans + make_interval(mins => a.tz_offset_min))::date as fecha_local,
  w.fecha_recaudo,
  w.valor_recaudado,
  case when w.fecha_recaudo is not null then 'ENTREGADO'
       else public.effi_estado_unificado(g.est_guia_efficommerce) end as estado_u,
  (g.fecha_anular is not null or g.vigente is false) as anulada,
  coalesce(g.nombre_destinatario like '*%', false) as recuperado
from public.effi_guias g
join public.effi_accounts a on a.slug = g.cuenta
left join lateral (
  select min(m.fecha_trans) as fecha_recaudo, sum(m.valor) as valor_recaudado
  from public.effi_wallet m
  where m.cuenta = g.cuenta and m.guia_inicial = g.guia and m.t_movimiento = 1 and m.vigente is not false
) w on true;

-- ───────────────────────── KPIs ─────────────────────────
-- Todas: p_cuentas null = todas las cuentas visibles; rango por fecha local de creación de la guía.

create function public.kpi_resumen(p_cuentas text[], p_desde date, p_hasta date)
returns table (
  cuenta text, nombre text, pais text, divisa text,
  guias bigint, entregadas bigint, devoluciones bigint, en_transito bigint, novedad bigint,
  en_oficina bigint, pendientes bigint, indemnizadas bigint, recuperados bigint,
  efectividad numeric, pct_devolucion numeric,
  recaudo_potencial numeric, recaudo_entregado numeric, ticket_promedio numeric,
  flete_total numeric, flete_promedio numeric,
  sin_liquidar bigint, dias_entrega numeric, dias_pago numeric
)
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select g.cuenta, max(g.nombre_cuenta), max(g.pais), max(g.divisa),
    count(*),
    count(*) filter (where estado_u = 'ENTREGADO'),
    count(*) filter (where estado_u = 'DEVOLUCION'),
    count(*) filter (where estado_u = 'EN_TRANSITO'),
    count(*) filter (where estado_u = 'NOVEDAD'),
    count(*) filter (where estado_u = 'EN_OFICINA'),
    count(*) filter (where estado_u = 'PENDIENTE'),
    count(*) filter (where estado_u = 'INDEMNIZACION'),
    count(*) filter (where recuperado),
    round(count(*) filter (where estado_u = 'ENTREGADO')::numeric
      / nullif(count(*) filter (where estado_u in ('ENTREGADO', 'DEVOLUCION')), 0), 4),
    round(count(*) filter (where estado_u = 'DEVOLUCION')::numeric
      / nullif(count(*) filter (where estado_u <> 'INDEMNIZACION'), 0), 4),
    sum(valor_recaudo) filter (where recaudo),
    sum(valor_recaudo) filter (where recaudo and estado_u = 'ENTREGADO'),
    round(avg(valor_recaudo) filter (where recaudo and valor_recaudo > 0), 2),
    sum(valor_flete),
    round(avg(valor_flete) filter (where valor_flete > 0), 2),
    count(*) filter (where est_guia_efficommerce = 4 and fecha_recaudo is null and recaudo),
    round(avg(extract(epoch from fecha_estado_final - fecha_trans) / 86400)
      filter (where estado_u = 'ENTREGADO' and fecha_estado_final is not null)::numeric, 1),
    round(avg(extract(epoch from fecha_recaudo - fecha_estado_final) / 86400)
      filter (where fecha_recaudo is not null and fecha_estado_final is not null)::numeric, 1)
  from public.v_guias g
  where not anulada and estado_u <> 'EXCLUIDA'
    and (p_cuentas is null or g.cuenta = any (p_cuentas))
    and fecha_local between p_desde and p_hasta
  group by g.cuenta
  order by g.cuenta;
$$;

create function public.kpi_diario(p_cuentas text[], p_desde date, p_hasta date)
returns table (fecha date, cuenta text, estado_u text, guias bigint)
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select fecha_local, cuenta, estado_u, count(*)
  from public.v_guias
  where not anulada and estado_u <> 'EXCLUIDA'
    and (p_cuentas is null or cuenta = any (p_cuentas))
    and fecha_local between p_desde and p_hasta
  group by 1, 2, 3 order by 1;
$$;

create function public.kpi_transportadoras(p_cuentas text[], p_desde date, p_hasta date)
returns table (
  cuenta text, transportadora text, guias bigint, entregadas bigint, devoluciones bigint, abiertas bigint,
  efectividad numeric, pct_devolucion numeric, flete_promedio numeric, ticket_promedio numeric,
  recaudo_entregado numeric, dias_entrega numeric, dias_pago numeric, sin_liquidar bigint
)
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select cuenta, coalesce(nombre_transportadora_efficommerce, nombre_transportadora, 'Sin transportadora'),
    count(*),
    count(*) filter (where estado_u = 'ENTREGADO'),
    count(*) filter (where estado_u = 'DEVOLUCION'),
    count(*) filter (where estado_u in ('EN_TRANSITO', 'NOVEDAD', 'EN_OFICINA', 'PENDIENTE')),
    round(count(*) filter (where estado_u = 'ENTREGADO')::numeric
      / nullif(count(*) filter (where estado_u in ('ENTREGADO', 'DEVOLUCION')), 0), 4),
    round(count(*) filter (where estado_u = 'DEVOLUCION')::numeric
      / nullif(count(*) filter (where estado_u <> 'INDEMNIZACION'), 0), 4),
    round(avg(valor_flete) filter (where valor_flete > 0), 2),
    round(avg(valor_recaudo) filter (where recaudo and valor_recaudo > 0), 2),
    sum(valor_recaudo) filter (where recaudo and estado_u = 'ENTREGADO'),
    round(avg(extract(epoch from fecha_estado_final - fecha_trans) / 86400)
      filter (where estado_u = 'ENTREGADO' and fecha_estado_final is not null)::numeric, 1),
    round(avg(extract(epoch from fecha_recaudo - fecha_estado_final) / 86400)
      filter (where fecha_recaudo is not null and fecha_estado_final is not null)::numeric, 1),
    count(*) filter (where est_guia_efficommerce = 4 and fecha_recaudo is null and recaudo)
  from public.v_guias
  where not anulada and estado_u <> 'EXCLUIDA'
    and (p_cuentas is null or cuenta = any (p_cuentas))
    and fecha_local between p_desde and p_hasta
  group by 1, 2 order by 3 desc;
$$;

create function public.kpi_ciudades(p_cuentas text[], p_desde date, p_hasta date, p_min int default 10)
returns table (cuenta text, provincia text, ciudad text, guias bigint, entregadas bigint, devoluciones bigint, efectividad numeric)
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select cuenta, nombre_provincia_destinatario, nombre_ciudad_destinatario,
    count(*),
    count(*) filter (where estado_u = 'ENTREGADO'),
    count(*) filter (where estado_u = 'DEVOLUCION'),
    round(count(*) filter (where estado_u = 'ENTREGADO')::numeric
      / nullif(count(*) filter (where estado_u in ('ENTREGADO', 'DEVOLUCION')), 0), 4)
  from public.v_guias
  where not anulada and estado_u <> 'EXCLUIDA'
    and (p_cuentas is null or cuenta = any (p_cuentas))
    and fecha_local between p_desde and p_hasta
  group by 1, 2, 3
  having count(*) >= p_min
  order by 4 desc
  limit 300;
$$;

-- Guías entregadas sin recaudo acreditado en el wallet: para reclamar a Effi (Inconsistencias).
create function public.kpi_sin_liquidar(p_cuentas text[], p_desde date, p_hasta date)
returns table (cuenta text, guia text, transportadora text, destino text, fecha_entrega timestamptz, dias numeric, valor_recaudo numeric, divisa text)
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select cuenta, guia, nombre_transportadora_efficommerce,
    concat_ws(', ', nombre_ciudad_destinatario, nombre_provincia_destinatario),
    fecha_estado_final,
    round((extract(epoch from now() - fecha_estado_final) / 86400)::numeric, 1),
    valor_recaudo, divisa
  from public.v_guias
  where not anulada and est_guia_efficommerce = 4 and fecha_recaudo is null and recaudo
    and (p_cuentas is null or cuenta = any (p_cuentas))
    and fecha_local between p_desde and p_hasta
  order by fecha_estado_final nulls last;
$$;

-- Guías abiertas sin cambio de estado en más de p_dias días.
create function public.kpi_estancadas(p_cuentas text[], p_dias int default 5)
returns table (cuenta text, guia text, estado text, transportadora text, destino text, ultimo_cambio timestamptz, dias numeric, valor_recaudo numeric, divisa text)
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select cuenta, guia, estado_efficommerce, nombre_transportadora_efficommerce,
    concat_ws(', ', nombre_ciudad_destinatario, nombre_provincia_destinatario),
    coalesce(ultimo_cambio_estado, fecha_trans),
    round((extract(epoch from now() - coalesce(ultimo_cambio_estado, fecha_trans)) / 86400)::numeric, 1),
    valor_recaudo, divisa
  from public.v_guias
  where not anulada and estado_u in ('EN_TRANSITO', 'NOVEDAD', 'EN_OFICINA')
    and coalesce(ultimo_cambio_estado, fecha_trans) < now() - make_interval(days => p_dias)
    and fecha_trans > now() - interval '90 days'
    and (p_cuentas is null or cuenta = any (p_cuentas))
  order by 7 desc
  limit 500;
$$;

-- Movimientos de wallet agrupados en líneas de PyG / caja (por fecha local del movimiento).
create function public.kpi_wallet(p_cuentas text[], p_desde date, p_hasta date)
returns table (cuenta text, divisa text, grupo text, linea text, movimientos bigint, total numeric)
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select m.cuenta, max(m.divisa), public.effi_grupo_wallet(m.t_movimiento), public.effi_linea_wallet(m.t_movimiento),
    count(*), sum(m.valor)
  from public.effi_wallet m
  join public.effi_accounts a on a.slug = m.cuenta
  where m.vigente is not false
    and (p_cuentas is null or m.cuenta = any (p_cuentas))
    and (m.fecha_trans + make_interval(mins => a.tz_offset_min))::date between p_desde and p_hasta
  group by 1, 3, 4 order by 1, 3, 6;
$$;

create function public.kpi_wallet_diario(p_cuentas text[], p_desde date, p_hasta date)
returns table (fecha date, cuenta text, grupo text, total numeric)
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select (m.fecha_trans + make_interval(mins => a.tz_offset_min))::date, m.cuenta, public.effi_grupo_wallet(m.t_movimiento), sum(m.valor)
  from public.effi_wallet m
  join public.effi_accounts a on a.slug = m.cuenta
  where m.vigente is not false
    and (p_cuentas is null or m.cuenta = any (p_cuentas))
    and (m.fecha_trans + make_interval(mins => a.tz_offset_min))::date between p_desde and p_hasta
  group by 1, 2, 3 order by 1;
$$;

-- Novedades por tipo: guías únicas, recuperadas (terminaron entregadas) y devueltas.
create function public.kpi_novedades(p_cuentas text[], p_desde date, p_hasta date)
returns table (cuenta text, novedad text, transportadora text, guias bigint, recuperadas bigint, devueltas bigint, abiertas bigint)
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  with n as (
    select distinct on (nv.cuenta, nv.guia, nv.nombre_novedad)
      nv.cuenta, nv.guia, coalesce(nv.nombre_novedad, 'Sin tipo') as novedad,
      coalesce(nv.nombre_transportadora_efficommerce, 'Sin transportadora') as transportadora, g.estado_u
    from public.effi_novedades nv
    join public.effi_accounts a on a.slug = nv.cuenta
    left join public.v_guias g on g.cuenta = nv.cuenta and g.guia = nv.guia
    where nv.t_novedad = 2 and nv.vigente is not false
      and (p_cuentas is null or nv.cuenta = any (p_cuentas))
      and (nv.fecha_trans + make_interval(mins => a.tz_offset_min))::date between p_desde and p_hasta
  )
  select cuenta, novedad, transportadora, count(*),
    count(*) filter (where estado_u = 'ENTREGADO'),
    count(*) filter (where estado_u = 'DEVOLUCION'),
    count(*) filter (where estado_u not in ('ENTREGADO', 'DEVOLUCION') or estado_u is null)
  from n group by 1, 2, 3 order by 4 desc;
$$;

-- Feed en vivo: últimos cambios de estado con datos de la guía.
create view public.v_feed_estados with (security_invoker = true) as
select e.cuenta, e.guia, e.fecha_hist_est, e.estado_new, e.estado_new_efficommerce, e.nombre_transportadora_efficommerce,
  g.nombre_ciudad_destinatario, g.nombre_provincia_destinatario, g.valor_recaudo, g.divisa, g.contenido
from public.effi_guia_estados e
left join public.effi_guias g on g.cuenta = e.cuenta and g.empresa = e.empresa and g.sucursal = e.sucursal and g.id = e.id_guia;

-- Solo usuarios autenticados ejecutan los KPIs (la RLS de las tablas filtra lo que ve cada uno).
do $$
declare f text;
begin
  foreach f in array array[
    'kpi_resumen(text[], date, date)', 'kpi_diario(text[], date, date)', 'kpi_transportadoras(text[], date, date)',
    'kpi_ciudades(text[], date, date, int)', 'kpi_sin_liquidar(text[], date, date)', 'kpi_estancadas(text[], int)',
    'kpi_wallet(text[], date, date)', 'kpi_wallet_diario(text[], date, date)', 'kpi_novedades(text[], date, date)',
    'app_es_owner()', 'app_puede_ver(text, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
revoke all on public.v_guias, public.v_feed_estados from anon;
grant select on public.v_guias, public.v_feed_estados to authenticated;

-- Índices para los cruces de la vista.
create index if not exists effi_wallet_recaudo on public.effi_wallet (cuenta, guia_inicial) where t_movimiento = 1;
create index if not exists effi_guia_estados_guia_ix on public.effi_guia_estados (cuenta, empresa, sucursal, id_guia);
create index if not exists effi_novedades_t2 on public.effi_novedades (cuenta, t_novedad, fecha_trans);
