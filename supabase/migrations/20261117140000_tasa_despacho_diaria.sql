-- 📦 Tasa de despacho (pedido del dueño, 17-nov-2026): por país y día, las ventas que entraron a LucidBot
-- (app_pedidos_diarios) frente a las guías que se generaron ese día (Effi: v_guias.fecha_local, sin anuladas;
-- Dropi: fecha_guia con guía). Tasa = guías ÷ ventas; un día puede pasar de 100 % cuando se ponen al día ventas anteriores.
-- Solo las tiendas con ventas de LucidBot cargadas y que la persona ve en Data Experience (módulo resumen).

create or replace function public.tasa_despacho_diaria(p_cuentas text[] default null, p_desde date default null, p_hasta date default null)
returns table (cuenta text, fecha date, ventas bigint, guias_effi bigint, guias_dropi bigint)
language sql stable security definer set search_path to '' as $$
  with vis as (
    select a.slug from public.effi_accounts a
    where a.tipo = 'tienda' and a.slug = any (public.app_cuentas_visibles('resumen'))
      and (p_cuentas is null or a.slug = any (p_cuentas))
      and exists (select 1 from public.app_pedidos_diarios p where p.cuenta = a.slug)
  ),
  r as (select coalesce(p_desde, (now() - interval '5 hours')::date - 29) as d, coalesce(p_hasta, (now() - interval '5 hours')::date) as h),
  dias as (select v.slug as cuenta, g::date as fecha from vis v, r, generate_series(r.d, r.h, interval '1 day') g),
  lu as (select p.cuenta, p.fecha, sum(p.pedidos)::bigint n from public.app_pedidos_diarios p join vis on vis.slug = p.cuenta, r
         where p.fecha between r.d and r.h group by 1, 2),
  ef as (select g.cuenta, g.fecha_local as fecha, count(*) n from public.v_guias g join vis on vis.slug = g.cuenta, r
         where g.fecha_local between r.d and r.h and g.vigente is not false and not coalesce(g.anulada, false) group by 1, 2),
  dr as (select o.cuenta, o.fecha_guia::date as fecha, count(*) n from public.v_dropi_ordenes o join vis on vis.slug = o.cuenta, r
         where o.fecha_guia::date between r.d and r.h and nullif(o.guia, '') is not null group by 1, 2)
  select d.cuenta, d.fecha, coalesce(lu.n, 0), coalesce(ef.n, 0), coalesce(dr.n, 0)
  from dias d
  left join lu on lu.cuenta = d.cuenta and lu.fecha = d.fecha
  left join ef on ef.cuenta = d.cuenta and ef.fecha = d.fecha
  left join dr on dr.cuenta = d.cuenta and dr.fecha = d.fecha
  order by d.cuenta, d.fecha;
$$;

revoke all on function public.tasa_despacho_diaria(text[], date, date) from public, anon;
grant execute on function public.tasa_despacho_diaria(text[], date, date) to authenticated, service_role;
