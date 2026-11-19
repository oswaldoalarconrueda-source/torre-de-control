-- Cargar desde el computador (scripts/cargar-dropi.mjs) los Excel de órdenes y de órdenes por producto de Dropi, igual que en
-- Cargar archivos, 19-nov-2026. Usa el mismo app_cargar de la web; solo cambia quién está autorizado: el dueño en la web o
-- el token de sincronización aquí. Antes de guardar revisa que las órdenes sean de esa tienda.

do $do$
declare f text; g text;
begin
  f := pg_get_functiondef('public.app_cargar(text,text,text,jsonb,bigint,jsonb)'::regprocedure);
  g := replace(f, 'if not public.app_es_owner() then',
                  'if not (public.app_es_owner() or current_setting(''app.carga_sistema'', true) = ''si'') then');
  if g = f then raise exception 'No se encontró la revisión del dueño en app_cargar'; end if;
  execute g;
end $do$;

create or replace function public.app_cargar_sistema(p_sync text, p_tipo text, p_cuenta text, p_archivo text, p_filas jsonb,
  p_carga bigint default null, p_resumen jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_suyas int; v_otras int; v_tienda_otra int;
begin
  if not coalesce(public.effi_check_sync_token(p_sync), false) then raise exception 'Token inválido'; end if;
  if p_tipo not in ('dropi_ordenes', 'dropi_productos') then raise exception 'Tipo no permitido: %', p_tipo; end if;
  if not exists (select 1 from public.effi_accounts where slug = p_cuenta and tipo = 'tienda') then raise exception 'Cuenta inválida: %', p_cuenta; end if;

  -- Órdenes que ya están en otra tienda (sin contar Drop, que usa otra numeración).
  select count(*) filter (where o.cuenta = p_cuenta), count(*) filter (where o.cuenta <> p_cuenta)
  into v_suyas, v_otras
  from (select distinct coalesce(e->>'id', e->>'orden_id')::bigint as oid from jsonb_array_elements(p_filas) e) x
  join public.dropi_ordenes o on o.id = x.oid and coalesce(o.tienda, '') <> 'drop';
  if v_otras > 0 and v_otras * 10 > v_suyas then
    raise exception 'El archivo no parece de %: % órdenes son de esta tienda y % de otra', p_cuenta, v_suyas, v_otras;
  end if;

  -- El código de tienda de Dropi (columna tienda) no debe ser de otra cuenta.
  if p_tipo = 'dropi_ordenes' then
    select count(*) into v_tienda_otra
    from (select distinct e->>'tienda' as t from jsonb_array_elements(p_filas) e where coalesce(e->>'tienda', '') <> '') x
    where exists (select 1 from public.dropi_ordenes o where o.tienda = x.t and o.cuenta <> p_cuenta)
      and not exists (select 1 from public.dropi_ordenes o where o.tienda = x.t and o.cuenta = p_cuenta);
    if v_tienda_otra > 0 then raise exception 'El archivo trae tiendas de Dropi que son de otra cuenta'; end if;
  end if;

  perform set_config('app.carga_sistema', 'si', true);
  return public.app_cargar(p_tipo, p_cuenta, p_archivo, p_filas, p_carga, coalesce(p_resumen, '{}'::jsonb) || '{"origen": "script"}'::jsonb)
    || jsonb_build_object('ordenes_suyas', v_suyas, 'ordenes_otras', v_otras);
end $$;
revoke all on function public.app_cargar_sistema(text, text, text, text, jsonb, bigint, jsonb) from public, authenticated;
grant execute on function public.app_cargar_sistema(text, text, text, text, jsonb, bigint, jsonb) to anon, service_role;
