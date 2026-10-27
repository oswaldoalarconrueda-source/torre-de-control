-- 📢 Publicidad solo para el dueño y los socios: a empleados y proveedores la función no les devuelve gasto aunque
-- tengan el módulo "resumen" en la tienda.
do $$
begin
  execute replace(pg_get_functiondef('public.publicidad_resumen(text[], date, date)'::regprocedure),
    'where a.tipo = ''tienda'' and a.slug = any (public.app_cuentas_visibles(''resumen''))',
    'where a.tipo = ''tienda'' and a.slug = any (public.app_cuentas_visibles(''resumen''))
      and exists (select 1 from public.app_usuarios u where u.user_id = (select auth.uid()) and u.activo and u.rol in (''owner'', ''socio''))');
end $$;
