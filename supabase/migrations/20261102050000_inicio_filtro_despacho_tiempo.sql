-- Inicio con calendario: lo de arriba y el equipo se mueven con el periodo. Despacho = guías con relación de despacho (Effi no
-- avisa cuando una guía entra a una relación: la función effi-despacho guarda el total por día en effi_despacho_dia). El equipo
-- muestra usuario, estado y tiempo conectado: cada latido suma lo transcurrido a app_tiempo_diario (día de Colombia).

create table if not exists public.effi_despacho_dia (
  cuenta text not null references public.effi_accounts (slug) on delete cascade,
  fecha date not null,
  guias integer not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, fecha)
);
alter table public.effi_despacho_dia enable row level security;

create table if not exists public.app_tiempo_diario (
  user_id uuid not null references public.app_usuarios (user_id) on delete cascade,
  fecha date not null,
  segundos integer not null default 0,
  primary key (user_id, fecha)
);
alter table public.app_tiempo_diario enable row level security;

-- Latido: suma lo transcurrido desde el anterior. Varias pestañas no cuentan doble (mínimo 30 s entre latidos) y un hueco de más
-- de 3 minutos (pestaña escondida, computador apagado) no suma.
create or replace function public.app_latido()
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  yo uuid := (select auth.uid());
  antes timestamptz;
  pasaron numeric;
begin
  select ultimo_visto into antes from public.app_usuarios where user_id = yo;
  if not found or (antes is not null and antes > now() - interval '30 seconds') then return; end if;
  update public.app_usuarios set ultimo_visto = now() where user_id = yo;
  pasaron := extract(epoch from now() - antes);
  if pasaron is not null and pasaron <= 180 then
    insert into public.app_tiempo_diario (user_id, fecha, segundos)
    values (yo, (now() - interval '5 hours')::date, round(pasaron)::int)
    on conflict (user_id, fecha) do update set segundos = public.app_tiempo_diario.segundos + excluded.segundos;
  end if;
end $$;

drop function if exists public.app_inicio_paises();
drop function if exists public.app_inicio_equipo();

-- Sin fechas: hoy en la hora de cada país. La gráfica y los totales de abajo son siempre del mes de la fecha final.
create function public.app_inicio_paises(p_desde date default null, p_hasta date default null)
returns jsonb
language sql stable security definer set search_path to '' set "TimeZone" to 'UTC'
as $$
  with perm as (
    select public.app_cuentas_visibles('resumen') as resumen,
      public.app_cuentas_visibles('resumen') || public.app_cuentas_visibles('guias') || public.app_cuentas_visibles('automatizacion') as conteo
  ),
  base as (
    select a.slug, make_interval(mins => a.tz_offset_min) as off,
      coalesce(p_desde, x.hoy) as d, coalesce(p_hasta, p_desde, x.hoy) as h
    from public.effi_accounts a
    cross join lateral (select (now() + make_interval(mins => a.tz_offset_min))::date as hoy) x
    where a.tipo = 'tienda' and a.activa and a.slug = any ((select conteo from perm)::text[])
      and exists (select 1 from public.effi_guias g where g.cuenta = a.slug and g.fecha_trans > now() - interval '30 days')
  ),
  vis as (
    select b.*, date_trunc('month', b.h)::date as mes,
      (b.d::timestamp - b.off)::timestamptz as ini, ((b.h + 1)::timestamp - b.off)::timestamptz as fin
    from base b
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cuenta', v.slug, 'hasta', v.h,
    'ordenes', o.n, 'ordenes_valor', case when ve then o.valor end,
    'remisiones', r.n + di.n, 'remisiones_valor', case when ve then r.valor + di.valor end,
    'guias', g.n, 'guias_valor', case when ve then g.valor end,
    'con_relacion', rel.n,
    'mes_guias', (k->'despachado'->>'n')::bigint, 'mes_entregadas', (k->'entregado'->>'n')::bigint,
    'mes_valor', case when ve then (k->'despachado'->>'venta')::numeric end,
    'serie', s.actual, 'serie_ant', s.anterior
  ) order by v.slug), '[]'::jsonb)
  from vis v
  cross join perm p
  cross join lateral (select v.slug = any (p.resumen) as ve) w(ve)
  cross join lateral (
    select count(*) as n, coalesce(sum(x.total), 0) as valor
    from public.auto_ordenes x
    where x.cuenta = v.slug and x.fecha_orden >= v.ini and x.fecha_orden < v.fin and not (x.orden_vigente is false and x.id_remision is null)
  ) o
  cross join lateral (
    select count(*) as n, coalesce(sum(x.total), 0) as valor
    from public.auto_ordenes x
    where x.cuenta = v.slug and x.rem_fecha >= v.ini and x.rem_fecha < v.fin and x.rem_vigente is not false
  ) r
  cross join lateral (
    select count(*) as n, coalesce(sum(g.valor_recaudo), 0) as valor
    from public.effi_guias g
    where g.cuenta = v.slug and g.t_trans_ref = 4 and g.vigente is not false and g.fecha_trans >= v.ini and g.fecha_trans < v.fin
      and not exists (select 1 from public.auto_ordenes x where x.cuenta = g.cuenta and x.id_remision = g.id_ref)
  ) di
  cross join lateral (
    select count(*) as n, coalesce(sum(coalesce(nullif(g.valor_recaudo, 0), g.valor_declarado, 0)), 0) as valor
    from public.effi_guias g
    where g.cuenta = v.slug and g.fecha_trans >= v.ini and g.fecha_trans < v.fin and g.vigente is not false
  ) g
  cross join lateral (
    select coalesce(sum(x.guias), 0)::bigint as n from public.effi_despacho_dia x where x.cuenta = v.slug and x.fecha between v.d and v.h
  ) rel
  cross join lateral (select public.kpi_despacho(v.slug, v.mes, v.h, 'ambas') as k) m
  cross join lateral (
    select
      (select coalesce(jsonb_agg(jsonb_build_object('d', extract(day from z.fecha)::int, 'n', z.n) order by z.fecha), '[]'::jsonb)
       from (select t.fecha, sum(t.guias) as n from public.kpi_diario_dim(array[v.slug], v.mes, v.h, null, null, null, 'ambas') t group by 1) z) as actual,
      (select coalesce(jsonb_agg(jsonb_build_object('d', extract(day from z.fecha)::int, 'n', z.n) order by z.fecha), '[]'::jsonb)
       from (select t.fecha, sum(t.guias) as n from public.kpi_diario_dim(array[v.slug], (v.mes - interval '1 month')::date, v.mes - 1, null, null, null, 'ambas') t group by 1) z) as anterior
  ) s;
$$;

-- Equipo, solo dueño y socios: usuario, si está en línea ahora (latido en los últimos 3 minutos) y tiempo conectado en el
-- periodo. Sin el dueño en la lista.
create function public.app_inicio_equipo(p_desde date default null, p_hasta date default null)
returns jsonb
language sql stable security definer set search_path to '' set "TimeZone" to 'UTC'
as $$
  with permitido as (
    select public.app_es_owner() or exists (select 1 from public.app_usuarios u where u.user_id = (select auth.uid()) and u.activo and u.rol = 'socio') as ok
  ),
  vis as (select a.slug, a.sociedad from public.effi_accounts a where a.slug = any (public.app_cuentas_visibles())),
  rango as (
    select coalesce(p_desde, (now() - interval '5 hours')::date) as d, coalesce(p_hasta, p_desde, (now() - interval '5 hours')::date) as h
  ),
  equipo as (
    select u.user_id, coalesce(nullif(trim(u.nombre), ''), split_part(u.email, '@', 1)) as nombre, u.ultimo_visto
    from public.app_usuarios u
    where (select ok from permitido) and u.activo and u.rol in ('socio', 'empleado', 'proveedor')
      and (u.sociedades && (select array_agg(sociedad) from vis)
        or exists (select 1 from public.app_permisos p where p.user_id = u.user_id and p.cuenta in (select slug from vis)))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'nombre', e.nombre, 'en_linea', coalesce(e.ultimo_visto > now() - interval '3 minutes', false),
    'visto', greatest(e.ultimo_visto, a.last_sign_in_at), 'segundos', t.s
  ) order by coalesce(e.ultimo_visto > now() - interval '3 minutes', false) desc, t.s desc, e.nombre), '[]'::jsonb)
  from equipo e
  left join auth.users a on a.id = e.user_id
  cross join lateral (
    select coalesce(sum(x.segundos), 0)::bigint as s from public.app_tiempo_diario x, rango r
    where x.user_id = e.user_id and x.fecha between r.d and r.h
  ) t;
$$;

revoke all on function public.app_latido() from public, anon;
revoke all on function public.app_inicio_paises(date, date) from public, anon;
revoke all on function public.app_inicio_equipo(date, date) from public, anon;
grant execute on function public.app_latido() to authenticated, service_role;
grant execute on function public.app_inicio_paises(date, date) to authenticated, service_role;
grant execute on function public.app_inicio_equipo(date, date) to authenticated, service_role;
