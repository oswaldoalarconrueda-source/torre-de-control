-- Carga del «Historial de cartera» de Dropi sin abrir Cargar archivos (18-nov-2026): scripts/cargar-dropi-cartera.mjs lee el
-- Excel que el dueño descarga de Dropi (1-ago → hoy), con la misma lectura de web/src/lib/cargas.ts, y lo manda aquí con el
-- token de sincronización. Hace lo mismo que app_cargar('dropi_cartera'): guarda por ID, así el archivo acumulado no duplica.
-- Seguridad: solo con el token de sync, solo cartera y solo si las órdenes del archivo son de esa tienda.

create or replace function public.dropi_cartera_cargar_sistema(p_sync text, p_cuenta text, p_archivo text, p_filas jsonb,
  p_carga bigint default null, p_resumen jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_carga bigint := p_carga;
  v_suyas int; v_otras int; v_n int;
begin
  if not coalesce(public.effi_check_sync_token(p_sync), false) then raise exception 'Token inválido'; end if;
  if not exists (select 1 from public.effi_accounts where slug = p_cuenta and tipo = 'tienda') then
    raise exception 'Cuenta inválida: %', p_cuenta;
  end if;
  -- Las órdenes que trae el archivo y ya conocemos deben ser de esta tienda (como el verificador de /cargas).
  select count(*) filter (where o.cuenta = p_cuenta), count(*) filter (where o.cuenta <> p_cuenta)
  into v_suyas, v_otras
  from (select distinct (f->>'orden_id')::bigint as oid from jsonb_array_elements(p_filas) f where f->>'orden_id' is not null) x
  join public.dropi_ordenes o on o.id = x.oid and coalesce(o.tienda, '') <> 'drop';
  if v_otras > 0 and v_otras * 10 > v_suyas then
    raise exception 'El archivo no parece de %: % órdenes son de esta tienda y % de otra', p_cuenta, v_suyas, v_otras;
  end if;

  if v_carga is null then
    insert into public.app_cargas (tipo, cuenta, archivo, resumen) values ('dropi_cartera', p_cuenta, p_archivo, p_resumen)
    returning id into v_carga;
  end if;
  insert into public.dropi_cartera (cuenta, id, fecha, tipo, monto, monto_previo, orden_id, guia, descripcion, concepto_retiro, carga_id)
  select p_cuenta, r.id, r.fecha, r.tipo, r.monto, r.monto_previo, r.orden_id, r.guia, r.descripcion, r.concepto_retiro, v_carga
  from jsonb_to_recordset(p_filas) as r(id bigint, fecha timestamp, tipo text, monto numeric, monto_previo numeric, orden_id bigint,
    guia text, descripcion text, concepto_retiro text)
  on conflict (cuenta, id) do update set fecha = excluded.fecha, tipo = excluded.tipo, monto = excluded.monto, monto_previo = excluded.monto_previo,
    orden_id = excluded.orden_id, guia = excluded.guia, descripcion = excluded.descripcion, concepto_retiro = excluded.concepto_retiro,
    carga_id = excluded.carga_id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('carga', v_carga, 'filas', v_n, 'omitidas', 0, 'ordenes_suyas', v_suyas, 'ordenes_otras', v_otras);
end $$;
revoke all on function public.dropi_cartera_cargar_sistema(text, text, text, jsonb, bigint, jsonb) from public, authenticated;
grant execute on function public.dropi_cartera_cargar_sistema(text, text, text, jsonb, bigint, jsonb) to anon, service_role;
