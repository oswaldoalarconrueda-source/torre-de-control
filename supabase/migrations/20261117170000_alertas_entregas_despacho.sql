-- 🔔 Primeras alertas al celular (pedido del dueño, 17-nov-2026):
--   1. entregas: cada pedido entregado (Effi, "Entregada a destino"), tipo Shopify, con la bandera y el valor. Si en un
--      minuto llegan más de 5 de un país, va un solo aviso con el total para no llenar la pantalla.
--   2. despacho: cuando Data Lucid tiene las ventas de un día, si la tasa de despacho (guías ÷ ventas LucidBot) de ese día
--      quedó por debajo del límite (80 %), avisa. Las ventas de LucidBot se cargan al día siguiente (~9–11 a. m.).
-- Cada alerta se puede apagar o cambiar el límite en Mis alertas (alerta_config).

create table if not exists public.alerta_config (
  clave text primary key,
  nombre text not null,
  detalle text,
  activa boolean not null default true,
  params jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now()
);
alter table public.alerta_config enable row level security;
insert into public.alerta_config (clave, nombre, detalle, params) values
  ('entregas', 'Pedido entregado', 'Al instante, cada pedido que la transportadora marca entregado, con la bandera y el valor. Más de 5 en un minuto de un país: un solo aviso con el total.', '{}'),
  ('despacho', 'Tasa de despacho baja', 'Una vez al día por país, cuando Data Lucid tiene las ventas del día: avisa si las guías generadas no llegaron al límite de las ventas de LucidBot.', '{"umbral": 80}')
on conflict (clave) do nothing;

-- Lo que ya se avisó (para no repetir).
create table if not exists public.alerta_enviada (
  clave text not null,
  ref text not null,
  creado_en timestamptz not null default now(),
  primary key (clave, ref)
);
alter table public.alerta_enviada enable row level security;

-- Bandera del país (CO → 🇨🇴) y plata con el formato del país.
create or replace function public.alerta_bandera(p_pais text) returns text
language sql immutable set search_path = '' as $$
  select chr(127397 + ascii(upper(substr(p_pais, 1, 1)))) || chr(127397 + ascii(upper(substr(p_pais, 2, 1))));
$$;
create or replace function public.alerta_plata(p_pais text, p_valor numeric) returns text
language sql immutable set search_path = '' as $$
  select case p_pais when 'GT' then 'Q' when 'CR' then '₡' when 'HN' then 'L' else '$' end ||
    case when p_pais in ('EC', 'SV')
      then translate(to_char(coalesce(p_valor, 0), 'FM999G999G990D00'), ',.', '.,')
      else replace(to_char(round(coalesce(p_valor, 0)), 'FM999G999G999G990'), ',', '.') end;
$$;

-- Encolar para los dueños sin despertar todavía la función push (las alertas encolan varias y despiertan una sola vez).
create or replace function public.push_encolar(p_tipo text, p_titulo text, p_cuerpo text, p_url text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.app_push_cola (user_id, tipo, titulo, cuerpo, url)
  select u.user_id, p_tipo, left(p_titulo, 120), left(p_cuerpo, 400), p_url
  from public.app_usuarios u
  where u.activo and u.user_id is not null and u.rol = 'owner'
    and exists (select 1 from public.app_push_suscripciones s where s.user_id = u.user_id and s.activa);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.push_encolar(text, text, text, text) from public, anon, authenticated;

-- La función push toma lo pendiente marcándolo en el mismo paso: si dos envíos corren a la vez, no mandan dos veces lo mismo.
create or replace function public.push_pendientes() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  with t as (
    update public.app_push_cola c set enviado_en = now()
    where c.id in (select id from public.app_push_cola where enviado_en is null and creado_en > now() - interval '6 hours'
                   order by creado_en limit 100 for update skip locked)
    returning c.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'tipo', t.tipo, 'titulo', t.titulo, 'cuerpo', t.cuerpo, 'url', t.url,
    'suscripciones', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
                      from public.app_push_suscripciones s where s.user_id = t.user_id and s.activa)) order by t.id), '[]'::jsonb)
  into r from t;
  return r;
end $$;
revoke all on function public.push_pendientes() from public, anon, authenticated;
grant execute on function public.push_pendientes() to service_role;

-- 1. Pedidos entregados (cada minuto). Mira las últimas 24 h de cambios de estado y avisa los que no se han avisado.
create or replace function public.alerta_entregas() returns int
language plpgsql security definer set search_path = '' set "TimeZone" to 'UTC' as $$
declare
  c record; e record; n int := 0; hoy record;
begin
  if not exists (select 1 from public.alerta_config where clave = 'entregas' and activa) then return 0; end if;
  create temp table if not exists _ent (cuenta text, empresa bigint, sucursal bigint, id_guia bigint, ref text) on commit drop;
  truncate _ent;
  insert into _ent
  select distinct h.cuenta, h.empresa, h.sucursal, h.id_guia, h.cuenta || ':' || h.empresa || ':' || h.sucursal || ':' || h.id_guia
  from public.effi_guia_estados h
  join public.effi_accounts a on a.slug = h.cuenta and a.tipo = 'tienda' and a.activa
  where h.fecha_hist_est > now() - interval '24 hours' and h.est_guia_new_efficommerce = 4
    and not exists (select 1 from public.alerta_enviada x where x.clave = 'entregas'
                    and x.ref = h.cuenta || ':' || h.empresa || ':' || h.sucursal || ':' || h.id_guia);
  if not exists (select 1 from _ent) then return 0; end if;
  insert into public.alerta_enviada (clave, ref) select 'entregas', ref from _ent on conflict do nothing;

  for c in
    select x.cuenta, a.pais, a.sociedad, a.tz_offset_min, count(*) as cant, sum(coalesce(g.valor_recaudo, 0)) as total
    from _ent x join public.effi_accounts a on a.slug = x.cuenta
    left join public.effi_guias g on g.cuenta = x.cuenta and g.empresa = x.empresa and g.sucursal = x.sucursal and g.id = x.id_guia
    group by 1, 2, 3, 4
  loop
    -- Lo entregado hoy (día del país) para el pie del aviso.
    select count(distinct (h.empresa, h.sucursal, h.id_guia)) as cant,
      coalesce(sum(g.valor_recaudo) filter (where g.recaudo), 0) as total
    into hoy
    from (select distinct h.empresa, h.sucursal, h.id_guia from public.effi_guia_estados h
          where h.cuenta = c.cuenta and h.est_guia_new_efficommerce = 4
            and h.fecha_hist_est >= (((now() + make_interval(mins => c.tz_offset_min))::date)::timestamp - make_interval(mins => c.tz_offset_min))) h
    left join public.effi_guias g on g.cuenta = c.cuenta and g.empresa = h.empresa and g.sucursal = h.sucursal and g.id = h.id_guia;

    if c.cant <= 5 then
      for e in
        select g.valor_recaudo, g.recaudo, g.nombre_ciudad_destinatario as ciudad, g.nombre_transportadora_efficommerce as transp
        from _ent x left join public.effi_guias g on g.cuenta = x.cuenta and g.empresa = x.empresa and g.sucursal = x.sucursal and g.id = x.id_guia
        where x.cuenta = c.cuenta
      loop
        n := n + public.push_encolar('entrega',
          public.alerta_bandera(c.pais) || ' ' || case when c.sociedad <> 'Joalix AA Group' then c.sociedad || ' · ' else '' end ||
            'Pedido entregado · ' || case when e.recaudo is false then 'pago anticipado' else public.alerta_plata(c.pais, e.valor_recaudo) end,
          concat_ws(' · ', initcap(lower(e.ciudad)), e.transp) || E'\nHoy: ' || hoy.cant || ' entregados · ' || public.alerta_plata(c.pais, hoy.total),
          '/datos?c=' || c.cuenta);
      end loop;
    else
      n := n + public.push_encolar('entrega',
        public.alerta_bandera(c.pais) || ' ' || case when c.sociedad <> 'Joalix AA Group' then c.sociedad || ' · ' else '' end ||
          c.cant || ' pedidos entregados · ' || public.alerta_plata(c.pais, c.total),
        'Hoy: ' || hoy.cant || ' entregados · ' || public.alerta_plata(c.pais, hoy.total),
        '/datos?c=' || c.cuenta);
    end if;
  end loop;
  if n > 0 then perform public.push_despachar(); end if;
  return n;
end $$;
revoke all on function public.alerta_entregas() from public, anon, authenticated;

-- Ventas LucidBot y guías generadas de un país en un día (la misma cuenta de Tasa de despacho, sin depender de quién mira).
create or replace function public.tasa_despacho_dia(p_cuenta text, p_dia date) returns table (ventas bigint, guias bigint)
language sql stable security definer set search_path = '' as $$
  select
    (select coalesce(sum(p.pedidos), 0)::bigint from public.app_pedidos_diarios p where p.cuenta = p_cuenta and p.fecha = p_dia),
    (select count(*) from public.v_guias g where g.cuenta = p_cuenta and g.fecha_local = p_dia and g.vigente is not false and not coalesce(g.anulada, false))
    + (select count(*) from public.v_dropi_ordenes o where o.cuenta = p_cuenta and o.fecha_guia::date = p_dia and nullif(o.guia, '') is not null);
$$;
revoke all on function public.tasa_despacho_dia(text, date) from public, anon, authenticated;

-- 2. Tasa de despacho baja (cada 10 minutos): cada día con ventas de LucidBot ya cargadas (últimos 3 días) se revisa una vez.
create or replace function public.alerta_despacho() returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record; t record; umbral numeric; n int := 0; tasa numeric;
begin
  select coalesce((params->>'umbral')::numeric, 80) into umbral from public.alerta_config where clave = 'despacho' and activa;
  if umbral is null then return 0; end if;
  for r in
    select p.cuenta, p.fecha, a.pais, a.sociedad
    from public.app_pedidos_diarios p join public.effi_accounts a on a.slug = p.cuenta and a.activa
    where p.fecha >= current_date - 3 and p.pedidos > 0
      and p.actualizado_en < now() - interval '5 minutes' -- que la persona termine de escribir
      and not exists (select 1 from public.alerta_enviada x where x.clave = 'despacho' and x.ref = p.cuenta || ':' || p.fecha)
    order by p.fecha, p.cuenta
  loop
    insert into public.alerta_enviada (clave, ref) values ('despacho', r.cuenta || ':' || r.fecha) on conflict do nothing;
    select * into t from public.tasa_despacho_dia(r.cuenta, r.fecha);
    tasa := case when t.ventas > 0 then round(t.guias * 100.0 / t.ventas, 1) end;
    if tasa is not null and tasa < umbral then
      n := n + public.push_encolar('despacho',
        public.alerta_bandera(r.pais) || ' ' || case when r.sociedad <> 'Joalix AA Group' then r.sociedad || ' · ' else '' end ||
          'Despacho bajo: ' || replace(tasa::text, '.', ',') || ' %',
        to_char(r.fecha, 'DD') || ' de ' || (array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month from r.fecha)::int] ||
          ': ' || t.guias || ' guías de ' || t.ventas || ' ventas LucidBot (meta ' || umbral::int || ' %). Faltaron ' || greatest(t.ventas - t.guias, 0) || ' por despachar.',
        '/tasa-despacho?c=' || r.cuenta || '&d=' || to_char(r.fecha - 6, 'YYYY-MM-DD') || '&h=' || to_char(r.fecha, 'YYYY-MM-DD'));
    end if;
  end loop;
  if n > 0 then perform public.push_despachar(); end if;
  return n;
end $$;
revoke all on function public.alerta_despacho() from public, anon, authenticated;

-- Mis alertas: ver y cambiar (solo dueño).
create or replace function public.alerta_config_lista() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('clave', clave, 'nombre', nombre, 'detalle', detalle, 'activa', activa, 'params', params) order by clave desc), '[]'::jsonb)
  from public.alerta_config where public.app_es_owner();
$$;
create or replace function public.alerta_config_guardar(p_clave text, p_activa boolean, p_params jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño'; end if;
  if p_clave = 'despacho' and p_params is not null and not ((p_params->>'umbral')::numeric between 1 and 200) then raise exception 'Límite inválido'; end if;
  update public.alerta_config set activa = p_activa, params = coalesce(p_params, params), actualizado_en = now() where clave = p_clave;
end $$;
revoke all on function public.alerta_config_lista() from public, anon;
revoke all on function public.alerta_config_guardar(text, boolean, jsonb) from public, anon;
grant execute on function public.alerta_config_lista() to authenticated;
grant execute on function public.alerta_config_guardar(text, boolean, jsonb) to authenticated;

-- Al encender: las entregas de las últimas 24 h y los días de Lucid ya cargados cuentan como avisados (no llega una avalancha).
insert into public.alerta_enviada (clave, ref)
select distinct 'entregas', h.cuenta || ':' || h.empresa || ':' || h.sucursal || ':' || h.id_guia
from public.effi_guia_estados h where h.fecha_hist_est > now() - interval '24 hours' and h.est_guia_new_efficommerce = 4
on conflict do nothing;
insert into public.alerta_enviada (clave, ref)
select 'despacho', p.cuenta || ':' || p.fecha from public.app_pedidos_diarios p where p.fecha >= current_date - 3
on conflict do nothing;

select cron.schedule('alerta-entregas', '* * * * *', $c$ select public.alerta_entregas(); $c$);
select cron.schedule('alerta-despacho', '*/10 * * * *', $c$ select public.alerta_despacho(); $c$);
