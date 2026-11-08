-- 📣 Campañas de Meta con sus fechas y estado, traídas por la API (meta-gasto, cada hora): creación, inicio y fin
-- programado, y estado efectivo (ACTIVE, PAUSED, ARCHIVED…). Con eso, Homologar campañas muestra cuándo empezó cada
-- campaña y cuándo se dejó de pautar (último día con gasto en toda la historia, no solo en el periodo).

create table if not exists public.meta_campanas (
  id text primary key,                 -- id de la campaña en Meta
  cuenta_ads_id text not null,
  cuenta_ads text not null,            -- nombre de la cuenta publicitaria (igual que app_publicidad_campanas.cuenta_ads)
  nombre text not null,
  creada timestamptz,
  inicio timestamptz,
  fin timestamptz,                     -- fin programado (casi siempre vacío: las campañas se pausan a mano)
  estado text,                         -- effective_status
  actualizado_en timestamptz not null default now()
);
create index if not exists meta_campanas_nombre on public.meta_campanas (nombre, cuenta_ads);
alter table public.meta_campanas enable row level security;

-- Campañas del periodo + fechas de toda la historia (primer y último día con gasto) + lo que dice Meta.
create or replace function public.prod_campanas(p_cuenta text, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('resumen')) as ok),
  c as (
    select c.campana, string_agg(distinct c.cuenta_ads, ', ') as cuentas, sum(c.monto_cop) as cop,
      count(distinct c.fecha) as dias, min(c.fecha) as desde, max(c.fecha) as hasta,
      array_agg(distinct c.cuenta_ads) as cuentas_arr
    from public.app_publicidad_campanas c
    where c.cuenta = p_cuenta and (select ok from permitido) and c.fecha between p_desde and p_hasta
    group by 1
  ),
  h as (
    select x.campana, min(x.fecha) as primer_gasto, max(x.fecha) as ultimo_gasto
    from public.app_publicidad_campanas x
    where x.cuenta = p_cuenta and x.campana in (select campana from c)
    group by 1
  )
  select jsonb_build_object(
    'campanas', coalesce((select jsonb_agg(jsonb_build_object('campana', c.campana, 'cuentas', c.cuentas, 'cop', round(c.cop),
        'dias', c.dias, 'desde', c.desde, 'hasta', c.hasta,
        'primer_gasto', h.primer_gasto, 'ultimo_gasto', h.ultimo_gasto,
        'creada', (m.creada at time zone 'America/Bogota')::date, 'inicio', (m.inicio at time zone 'America/Bogota')::date,
        'fin', (m.fin at time zone 'America/Bogota')::date, 'estado', m.estado,
        'manual', a.producto, 'asignado_por', a.asignado_por,
        'regla', r.producto, 'patron', r.patron) order by c.cop desc)
      from c
      left join h on h.campana = c.campana
      left join lateral (
        select min(mc.creada) as creada, min(mc.inicio) as inicio, max(mc.fin) as fin,
          -- si la misma campaña está en varias cuentas, la que siga activa manda
          (array_agg(mc.estado order by (mc.estado = 'ACTIVE') desc, mc.actualizado_en desc))[1] as estado
        from public.meta_campanas mc where mc.nombre = c.campana and mc.cuenta_ads = any (c.cuentas_arr)
      ) m on true
      left join public.prod_campana_asignada a on a.cuenta = p_cuenta and a.campana = c.campana
      left join lateral (select r.producto, r.patron from public.prod_campana_reglas r
        where (r.cuenta is null or r.cuenta = p_cuenta) and public.prod_clave(c.campana) ~ r.patron
        order by r.prioridad, r.id limit 1) r on true), '[]'::jsonb),
    'productos', coalesce((select jsonb_agg(distinct x.p order by x.p) from (
        select producto as p from public.prod_alias where cuenta is null or cuenta = p_cuenta
        union select producto from public.prod_campana_reglas where cuenta is null or cuenta = p_cuenta
        union select producto from public.prod_campana_asignada where cuenta = p_cuenta) x where (select ok from permitido)), '[]'::jsonb)
  );
$$;
revoke all on function public.prod_campanas(text, date, date) from public, anon;
grant execute on function public.prod_campanas(text, date, date) to authenticated;
