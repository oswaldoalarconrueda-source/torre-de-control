-- Módulo «Campañas sin identificar» (pedido del dueño, 23-nov-2026): pantalla propia (/campanas-sin-identificar), fuera de
-- Productos, para darle permiso a un empleado solo de eso: ve las campañas del periodo y dice de qué producto es cada una.
-- Quien tenga el módulo 'campanas' en una tienda puede leer sus campañas y asignarlas (antes solo el dueño y los socios).
do $do$
declare f text; d text; v text;
begin
  foreach f in array array['public.prod_campanas(text,date,date)', 'public.prod_productos_historicos(text)'] loop
    d := pg_get_functiondef(f::regprocedure);
    v := d;
    d := replace(d, $a$select p_cuenta = any (public.app_cuentas_visibles('resumen')) as ok$a$,
      $a$select (p_cuenta = any (public.app_cuentas_visibles('resumen')) or p_cuenta = any (public.app_cuentas_visibles('campanas'))) as ok$a$);
    if d = v then raise exception '% sin el permiso de resumen', f; end if;
    execute d;
  end loop;

  d := pg_get_functiondef('public.prod_asignar_campana(text,text,text)'::regprocedure);
  v := d;
  d := replace(d, $a$  if not (p_cuenta = any (public.app_cuentas_visibles('resumen'))
          and exists (select 1 from public.app_usuarios u where u.user_id = (select auth.uid()) and u.activo and u.rol in ('owner', 'socio'))) then$a$,
    $a$  if not ((p_cuenta = any (public.app_cuentas_visibles('resumen'))
           and exists (select 1 from public.app_usuarios u where u.user_id = (select auth.uid()) and u.activo and u.rol in ('owner', 'socio')))
          or p_cuenta = any (public.app_cuentas_visibles('campanas'))) then$a$);
  if d = v then raise exception 'prod_asignar_campana sin el permiso'; end if;
  execute d;
end $do$;
