-- 📦 La lista para homologar también trae los productos que la tienda pautó aunque no haya vendido (p. ej. Airi en
-- Ecuador: 5 campañas en julio-2026 y ninguna venta en Effi ni Dropi). Salen al final, con 0 guías.
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
  pautados as (
    select producto from public.prod_campana_asignada where cuenta = p_cuenta and (select ok from permitido)
    union
    select public.prod_de_campana(p_cuenta, c.campana)
    from (select distinct campana from public.app_publicidad_campanas where cuenta = p_cuenta and (select ok from permitido)) c
  ),
  a as (select distinct producto, 0::numeric as guias from pautados
        where producto is not null and producto <> '' and producto not in (select producto from v))
  select coalesce(jsonb_agg(jsonb_build_object('producto', producto, 'guias', guias) order by guias desc, producto), '[]'::jsonb)
  from (select * from v union all select * from a) x;
$$;
revoke all on function public.prod_productos_historicos(text) from public, anon;
grant execute on function public.prod_productos_historicos(text) to authenticated;
