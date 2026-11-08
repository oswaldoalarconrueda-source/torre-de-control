-- 📦 Guías exactas por producto en la lista para homologar: cada guía vigente de Effi cuenta una sola vez por producto
-- canónico (antes una guía con "Drenaje" y "Drenaje Mayaverra" contaba dos), más cada orden de Dropi una vez. Las
-- anuladas no cuentan. Los productos pautados sin ventas siguen saliendo, al final, con 0.
create or replace function public.prod_productos_historicos(p_cuenta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('resumen')) as ok),
  lineas as (
    select 'e' as fuente, g.sucursal::text || '-' || g.id::text as doc, public.prod_nombre(p_cuenta, m[2]) as producto
    from public.effi_guias g, regexp_matches(coalesce(g.contenido, ''), '(\d+)\s*\*\s*([^.]+)\.', 'g') m
    where g.cuenta = p_cuenta and g.vigente is not false and (select ok from permitido)
    union all
    select 'd', p.orden_id::text, public.prod_nombre(p_cuenta, p.producto)
    from public.dropi_orden_productos p
    where p.cuenta = p_cuenta and (select ok from permitido)
  ),
  v as (select producto, count(distinct (fuente, doc))::numeric as guias from lineas group by 1),
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
