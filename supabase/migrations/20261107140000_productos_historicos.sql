-- Homologación (pedido del dueño, 7-nov): el selector de producto ofrece lo que la tienda ha vendido en toda su historia
-- (guías de Effi y órdenes de Dropi), del más vendido al menos, con el número de guías. Los productos que ya se usaron en
-- una asignación a mano también aparecen, aunque no tengan ventas.
create or replace function public.prod_productos_historicos(p_cuenta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('resumen')) as ok),
  n as (
    select m[2] as nombre, count(*) as guias
    from public.effi_guias g, regexp_matches(coalesce(g.contenido, ''), '(\d+)\s*\*\s*([^.]+)\.', 'g') m
    where g.cuenta = p_cuenta and g.vigente is not false and (select ok from permitido)
    group by 1
    union all
    select p.producto, count(distinct p.orden_id) from public.dropi_orden_productos p
    where p.cuenta = p_cuenta and (select ok from permitido) group by 1
  ),
  v as (select public.prod_nombre(p_cuenta, nombre) as producto, sum(guias) as guias from n group by 1),
  a as (select distinct producto, 0::numeric as guias from public.prod_campana_asignada
        where cuenta = p_cuenta and (select ok from permitido) and producto not in (select producto from v))
  select coalesce(jsonb_agg(jsonb_build_object('producto', producto, 'guias', guias) order by guias desc, producto), '[]'::jsonb)
  from (select * from v union all select * from a) x;
$$;
revoke all on function public.prod_productos_historicos(text) from public, anon;
grant execute on function public.prod_productos_historicos(text) to authenticated;
