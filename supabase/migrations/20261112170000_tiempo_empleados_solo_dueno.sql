-- ⏱️ Gestión tiempo empleados (pedido del dueño, 12-nov-2026): el tiempo conectado del equipo pasa de Inicio a su propia
-- pantalla y solo lo ve el dueño (antes también los socios).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.app_inicio_equipo(date,date)'::regprocedure);
  d := replace(d, 'select public.app_es_owner() or exists (select 1 from public.app_usuarios u where u.user_id = (select auth.uid()) and u.activo and u.rol = ''socio'') as ok',
    'select public.app_es_owner() as ok');
  if position('select public.app_es_owner() as ok' in d) = 0 then raise exception 'app_inicio_equipo cambió'; end if;
  execute d;
end $$;
