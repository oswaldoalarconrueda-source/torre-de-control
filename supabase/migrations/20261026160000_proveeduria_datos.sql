-- "Datos" de la proveeduría (Distrilatam), con su propia lógica:
-- · Venta = remisión de venta de la proveeduría a la tienda (lo que nos paga la tienda = costo de la mercancía).
-- · Despachada = esa venta ya tiene guía (la guía la hace la tienda; Effi se la muestra a la proveeduría y la sincronización
--   ya la trae a effi_guias). Se unen por transaccion_dropshipping.
-- · Entregada / devolución = estado global de esa guía. Las cifras van por día de la venta, con el estado de hoy.
-- · Flete y publicidad no aplican (0). Comisión = 1% del costo de la mercancía despachada; la real cobrada sale del wallet
--   ("Comisión liquidación dropshipping", tipo 16) y lo liquidado ("Venta de mercancía dropshipping", tipo 3).
create table public.prov_remisiones (
  cuenta text not null references public.effi_accounts (slug),
  sucursal integer not null,
  id bigint not null,
  fecha_trans timestamptz not null,
  total numeric not null default 0,
  subtotal numeric,
  impuestos numeric,
  devolucion numeric,
  transaccion_dropshipping bigint,
  empresa_distribuidor bigint,
  distribuidor text,
  cliente text,
  ciudad text,
  provincia text,
  estado text,
  estado_dropshipping text,
  vigente boolean not null default true,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, sucursal, id)
);
create index prov_remisiones_fecha on public.prov_remisiones (cuenta, fecha_trans);
create index prov_remisiones_drop on public.prov_remisiones (cuenta, transaccion_dropshipping);
create index if not exists effi_guias_drop on public.effi_guias (cuenta, transaccion_dropshipping) where transaccion_dropshipping is not null;
alter table public.prov_remisiones enable row level security;

-- Hasta dónde va la carga de ventas de cada proveeduría (la función proveeduria avanza por tramos desde el 1 de enero).
create table public.prov_sync (
  cuenta text primary key references public.effi_accounts (slug),
  avance timestamptz not null default '2026-01-01T06:00:00Z'
);
alter table public.prov_sync enable row level security;
insert into public.prov_sync (cuenta) values ('DISTRI_GT'), ('DISTRI_CR'), ('DISTRI_LAB') on conflict do nothing;

-- Historial de guías y wallet de las proveedurías desde enero (sus guías son las de las tiendas que les compran).
insert into public.effi_sync_jobs (cuenta, recurso, desde_utc, hasta_utc, avance_utc)
select c.slug, r.recurso, r.desde, now(), r.desde
from (values ('DISTRI_GT'), ('DISTRI_CR'), ('DISTRI_LAB')) as c(slug)
cross join (values ('guias', '2026-01-01'::timestamptz), ('wallet', '2026-01-01'::timestamptz), ('hist', now() - interval '60 days')) as r(recurso, desde)
where not exists (select 1 from public.effi_sync_jobs j where j.cuenta = c.slug and j.recurso = r.recurso and j.estado = 'pendiente');

create or replace function public.prov_datos(p_cuenta text, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles()) as ok),
  tz as (select make_interval(mins => tz_offset_min) as off from public.effi_accounts where slug = p_cuenta and tipo = 'proveeduria'),
  r as (
    select x.*, (x.fecha_trans + (select off from tz))::date as dia
    from public.prov_remisiones x
    where x.cuenta = p_cuenta and (select ok from permitido) and x.vigente
      and x.fecha_trans >= (p_desde::timestamp - (select off from tz))::timestamptz
      and x.fecha_trans < ((p_hasta + 1)::timestamp - (select off from tz))::timestamptz
  ),
  v as (
    select r.*, g.guia, g.estado_efficommerce, g.nombre_transportadora_efficommerce as transportadora,
      case when g.guia is null then 'sin_guia'
           when g.fecha_recaudo is not null or g.est_guia_efficommerce = 4 then 'entregada'
           when g.est_guia_efficommerce = 5 then 'devolucion'
           else 'en_camino' end as fin
    from r
    left join lateral (
      select gg.* from public.effi_guias gg
      where gg.cuenta = r.cuenta and gg.transaccion_dropshipping = r.transaccion_dropshipping and gg.vigente is not false
      order by gg.fecha_trans desc limit 1
    ) g on r.transaccion_dropshipping is not null
  ),
  w as (
    select w.t_movimiento, w.valor from public.effi_wallet w
    where w.cuenta = p_cuenta and (select ok from permitido) and w.vigente is not false and w.t_movimiento in (3, 16)
      and w.fecha_trans >= (p_desde::timestamp - (select off from tz))::timestamptz
      and w.fecha_trans < ((p_hasta + 1)::timestamp - (select off from tz))::timestamptz
  ),
  tot as (
    select count(*) as ventas_n, coalesce(sum(total), 0) as ventas_valor,
      count(*) filter (where fin <> 'sin_guia') as despachadas_n, coalesce(sum(total) filter (where fin <> 'sin_guia'), 0) as despachadas_valor,
      count(*) filter (where fin = 'entregada') as entregadas_n, coalesce(sum(total) filter (where fin = 'entregada'), 0) as entregadas_valor,
      count(*) filter (where fin = 'devolucion') as devoluciones_n, coalesce(sum(total) filter (where fin = 'devolucion'), 0) as devoluciones_valor,
      count(*) filter (where fin = 'en_camino') as en_camino_n, coalesce(sum(total) filter (where fin = 'en_camino'), 0) as en_camino_valor,
      count(*) filter (where fin = 'sin_guia') as sin_guia_n, coalesce(sum(total) filter (where fin = 'sin_guia'), 0) as sin_guia_valor,
      count(distinct empresa_distribuidor) as tiendas
    from v
  )
  select jsonb_build_object(
    'totales', (select to_jsonb(tot) || jsonb_build_object(
        'comision_1pct', round(tot.despachadas_valor * 0.01, 2),
        'comision_wallet', coalesce((select -sum(valor) from w where t_movimiento = 16), 0),
        'liquidado_wallet', coalesce((select sum(valor) from w where t_movimiento = 3), 0),
        'liquidaciones_n', (select count(*) from w where t_movimiento = 3)) from tot),
    'por_dia', coalesce((select jsonb_agg(d order by d.dia) from (
        select dia, count(*) as ventas_n, sum(total) as ventas_valor,
          count(*) filter (where fin <> 'sin_guia') as despachadas_n,
          count(*) filter (where fin = 'entregada') as entregadas_n, coalesce(sum(total) filter (where fin = 'entregada'), 0) as entregadas_valor,
          count(*) filter (where fin = 'devolucion') as devoluciones_n,
          count(*) filter (where fin = 'en_camino') as en_camino_n,
          count(*) filter (where fin = 'sin_guia') as sin_guia_n
        from v group by dia) d), '[]'::jsonb),
    'por_tienda', coalesce((select jsonb_agg(t order by t.ventas_valor desc) from (
        select coalesce(distribuidor, '—') as tienda, count(*) as ventas_n, sum(total) as ventas_valor,
          count(*) filter (where fin <> 'sin_guia') as despachadas_n,
          count(*) filter (where fin = 'entregada') as entregadas_n, coalesce(sum(total) filter (where fin = 'entregada'), 0) as entregadas_valor,
          count(*) filter (where fin = 'devolucion') as devoluciones_n
        from v group by 1) t), '[]'::jsonb),
    'por_estado', coalesce((select jsonb_agg(e order by e.n desc) from (
        select coalesce(estado_efficommerce, 'Sin guía') as estado, count(*) as n, sum(total) as valor from v group by 1) e), '[]'::jsonb),
    'por_transportadora', coalesce((select jsonb_agg(t order by t.n desc) from (
        select transportadora, count(*) as n, count(*) filter (where fin = 'entregada') as entregadas, count(*) filter (where fin = 'devolucion') as devoluciones
        from v where transportadora is not null group by 1) t), '[]'::jsonb),
    'carga', (select jsonb_build_object('avance', s.avance) from public.prov_sync s where s.cuenta = p_cuenta)
  );
$$;
revoke all on function public.prov_datos(text, date, date) from public, anon;
grant execute on function public.prov_datos(text, date, date) to authenticated;

-- Ventas de la proveeduría cada 10 min (los indicadores siguen cada 30): así "Datos" va casi en vivo y el historial
-- desde enero se completa en pocas horas.
create or replace function public.prov_refrescar_ventas() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/proveeduria?solo=ventas',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 150000);
$$;
revoke all on function public.prov_refrescar_ventas() from public, anon, authenticated;
select cron.schedule('proveeduria-ventas-10min', '5,15,25,35,45,55 * * * *', $$ select public.prov_refrescar_ventas(); $$);
