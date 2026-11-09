-- 📤 Verificador de tienda al cargar archivos de Dropi (lo pidió el dueño el 9-nov-2026, después de que tres archivos
-- de A un clic entraran en Joalix GT). Con lo ya cargado dice de qué tienda del Centro de Control es un archivo:
--   · por el número de tienda de Dropi de las órdenes (1117416 = Joalix GT; 1331725, "A Un Clic", 7369799 = A un clic);
--   · por los números de orden (archivos de productos y de cartera, que no traen la tienda).
-- Solo el dueño (es el único que carga).
create or replace function public.dropi_verificar(p_tiendas text[], p_ordenes bigint[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.app_es_owner() then '{}'::jsonb else jsonb_build_object(
    'tiendas', coalesce((select jsonb_object_agg(t.tienda, t.cuentas) from (
        select o.tienda, jsonb_agg(distinct o.cuenta) as cuentas
        from public.dropi_ordenes o where o.tienda = any (coalesce(p_tiendas, '{}')) group by 1) t), '{}'::jsonb),
    'ordenes', coalesce((select jsonb_object_agg(x.cuenta, x.n) from (
        select o.cuenta, count(*) as n from public.dropi_ordenes o
        where o.id = any (coalesce(p_ordenes, '{}')) group by 1) x), '{}'::jsonb)
  ) end;
$$;
revoke all on function public.dropi_verificar(text[], bigint[]) from public, anon;
grant execute on function public.dropi_verificar(text[], bigint[]) to authenticated;
