-- Módulo «Cargar archivos» (19-nov-2026): el dueño puede darle a un empleado la carga de los Excel (cartera y órdenes de Dropi,
-- billetera y órdenes de Drop, pedidos de icomfly) de las tiendas que le asigne. Antes solo el dueño podía cargar.
-- Meta (CSV por BM) sigue siendo solo del dueño: no tiene tienda y reparte gasto entre sociedades.
-- Los documentos financieros siguen siendo solo del dueño (su política no cambia).

do $do$
declare f text; g text;
begin
  -- app_cargar: también quien tenga el módulo en esa tienda (menos Meta).
  f := pg_get_functiondef('public.app_cargar(text,text,text,jsonb,bigint,jsonb)'::regprocedure);
  g := replace(f, 'if not (public.app_es_owner() or current_setting(''app.carga_sistema'', true) = ''si'') then',
    'if not (public.app_es_owner() or current_setting(''app.carga_sistema'', true) = ''si''
           or (p_tipo <> ''meta_bm'' and p_cuenta = any (public.app_cuentas_visibles(''cargas'')))) then');
  if g = f then raise exception 'No se encontró la revisión en app_cargar'; end if;
  execute g;

  -- drop_conciliar: la conciliación que corre después de cargar archivos de Drop.
  f := pg_get_functiondef('public.drop_conciliar(text)'::regprocedure);
  g := replace(f, 'if not public.app_es_owner() then raise exception ''Solo el dueño puede conciliar''',
    'if not (public.app_es_owner() or p_cuenta = any (public.app_cuentas_visibles(''cargas''))) then raise exception ''Sin permiso para conciliar''');
  if g = f then raise exception 'No se encontró la revisión en drop_conciliar'; end if;
  execute g;

  -- dropi_verificar: el verificador de tienda del cargador (solo devuelve en qué cuenta están órdenes, guías y tiendas).
  f := pg_get_functiondef('public.dropi_verificar(text[],bigint[],text[])'::regprocedure);
  g := replace(f, 'case when not public.app_es_owner() then',
    'case when not (public.app_es_owner() or cardinality(public.app_cuentas_visibles(''cargas'')) > 0) then');
  if g = f then raise exception 'No se encontró la revisión en dropi_verificar'; end if;
  execute g;

  -- app_estado_cargas: «Qué hay cargado», solo de sus tiendas.
  f := pg_get_functiondef('public.app_estado_cargas()'::regprocedure);
  g := replace(f, 'where public.app_es_owner()',
    'where public.app_es_owner() or x.cuenta = any (public.app_cuentas_visibles(''cargas''))');
  if g = f then raise exception 'No se encontró la revisión en app_estado_cargas'; end if;
  execute g;
end $do$;
