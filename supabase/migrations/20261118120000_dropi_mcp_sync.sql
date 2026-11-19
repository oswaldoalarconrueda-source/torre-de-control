-- Dropi por su MCP oficial (mcp.dropi.co, OAuth), 18-nov-2026: la función dropi-sync trae cada hora las órdenes de Dropi de
-- A un clic Guatemala (estado, guía, transportadora, valor, ciudad y productos) sin esperar el Excel de órdenes.
-- La autorización la da el dueño una vez en oauth.dropi.co (scripts/autorizar-dropi.mjs); el permiso (client_id + refresh_token)
-- queda cifrado en el Vault y la función lo renueva sola. El Excel de órdenes sigue sirviendo para flete, costo y comisión:
-- si llega, completa esos datos; la sincronización nunca los borra. La ganancia sigue saliendo de la cartera.

create table if not exists public.dropi_conexion (
  cuenta text primary key references public.effi_accounts (slug),
  guardado_en timestamptz not null default now(),
  ultima_sync timestamptz,
  ultimo_error text,
  resumen jsonb
);
alter table public.dropi_conexion enable row level security;

-- Guardar el permiso (lo llama scripts/autorizar-dropi.mjs con el token de sincronización).
create or replace function public.dropi_guardar_oauth(p_sync text, p_cuenta text, p_oauth jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare v uuid; nombre text;
begin
  if not coalesce(public.effi_check_sync_token(p_sync), false) then raise exception 'Token de sincronización inválido'; end if;
  if p_cuenta not in ('AUNCLIC_GT', 'TIENDA_GT', 'TIENDA_CO') then raise exception 'Tienda no permitida: %', p_cuenta; end if;
  if coalesce(p_oauth->>'refresh_token', '') = '' or coalesce(p_oauth->>'client_id', '') = '' then raise exception 'Falta refresh_token o client_id'; end if;
  nombre := 'dropi_oauth_' || lower(p_cuenta);
  select id into v from vault.secrets where name = nombre;
  if v is null then perform vault.create_secret(p_oauth::text, nombre);
  else perform vault.update_secret(v, p_oauth::text, nombre); end if;
  insert into public.dropi_conexion (cuenta, guardado_en) values (p_cuenta, now())
  on conflict (cuenta) do update set guardado_en = now(), ultimo_error = null;
  return nombre;
end $$;
revoke all on function public.dropi_guardar_oauth(text, text, jsonb) from public, authenticated;
grant execute on function public.dropi_guardar_oauth(text, text, jsonb) to anon, service_role;

-- Para la función (service_role): leer y renovar el permiso.
create or replace function public.dropi_oauth(p_cuenta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select decrypted_secret::jsonb from vault.decrypted_secrets where name = 'dropi_oauth_' || lower(p_cuenta);
$$;
create or replace function public.dropi_oauth_actualizar(p_cuenta text, p_oauth jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select id into v from vault.secrets where name = 'dropi_oauth_' || lower(p_cuenta);
  if v is null then raise exception 'Sin permiso guardado para %', p_cuenta; end if;
  perform vault.update_secret(v, p_oauth::text);
end $$;
revoke all on function public.dropi_oauth(text) from public, anon, authenticated;
revoke all on function public.dropi_oauth_actualizar(text, jsonb) from public, anon, authenticated;
grant execute on function public.dropi_oauth(text), public.dropi_oauth_actualizar(text, jsonb) to service_role;

-- Guardar órdenes que trae el MCP. Nuevas: entran con lo que trae Dropi. Existentes: se actualiza el estado y lo logístico;
-- flete, costo, comisión y ganancia (del Excel y la cartera) no se tocan.
create or replace function public.dropi_guardar_ordenes_mcp(p_cuenta text, p_filas jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_nuevas int; v_total int;
begin
  if p_cuenta not in ('AUNCLIC_GT', 'TIENDA_GT', 'TIENDA_CO') then raise exception 'Tienda no permitida: %', p_cuenta; end if;
  select count(*) into v_nuevas from jsonb_to_recordset(p_filas) r(id bigint)
  where not exists (select 1 from public.dropi_ordenes o where o.cuenta = p_cuenta and o.id = r.id);
  insert into public.dropi_ordenes as d (cuenta, id, fecha, hora, guia, estatus, tipo_envio, departamento, ciudad, transportadora, venta,
    ultimo_movimiento, fecha_ultimo_movimiento, tienda, tipo_tienda, id_orden_tienda, fecha_guia, actualizado_en)
  select p_cuenta, r.id, r.fecha, r.hora, r.guia, r.estatus, r.tipo_envio, r.departamento, r.ciudad, r.transportadora, r.venta,
    r.estatus, current_date, r.tienda, r.tipo_tienda, r.id_orden_tienda, case when r.guia is not null then r.fecha end, now()
  from jsonb_to_recordset(p_filas) as r(id bigint, fecha date, hora text, guia text, estatus text, tipo_envio text, departamento text,
    ciudad text, transportadora text, venta numeric, tienda text, tipo_tienda text, id_orden_tienda text)
  on conflict (cuenta, id) do update set
    estatus = coalesce(excluded.estatus, d.estatus),
    guia = coalesce(excluded.guia, d.guia),
    transportadora = coalesce(excluded.transportadora, d.transportadora),
    departamento = coalesce(d.departamento, excluded.departamento),
    ciudad = coalesce(d.ciudad, excluded.ciudad),
    venta = coalesce(d.venta, excluded.venta),
    tienda = coalesce(d.tienda, excluded.tienda),
    tipo_tienda = coalesce(d.tipo_tienda, excluded.tipo_tienda),
    id_orden_tienda = coalesce(d.id_orden_tienda, excluded.id_orden_tienda),
    fecha_guia = coalesce(d.fecha_guia, excluded.fecha_guia),
    ultimo_movimiento = case when excluded.estatus is distinct from d.estatus then excluded.estatus else d.ultimo_movimiento end,
    fecha_ultimo_movimiento = case when excluded.estatus is distinct from d.estatus then current_date else d.fecha_ultimo_movimiento end,
    actualizado_en = case when excluded.estatus is distinct from d.estatus or excluded.guia is distinct from d.guia then now() else d.actualizado_en end;
  get diagnostics v_total = row_count;
  return jsonb_build_object('total', v_total, 'nuevas', v_nuevas);
end $$;
revoke all on function public.dropi_guardar_ordenes_mcp(text, jsonb) from public, anon, authenticated;
grant execute on function public.dropi_guardar_ordenes_mcp(text, jsonb) to service_role;

-- Productos de una orden (de get_order), solo si la orden aún no tiene productos (el Excel por producto manda).
create or replace function public.dropi_guardar_productos_mcp(p_cuenta text, p_filas jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_cuenta not in ('AUNCLIC_GT', 'TIENDA_GT', 'TIENDA_CO') then raise exception 'Tienda no permitida: %', p_cuenta; end if;
  insert into public.dropi_orden_productos (cuenta, orden_id, linea, producto_id, variacion_id, sku, producto, variacion, cantidad,
    precio_proveedor, precio_proveedor_total)
  select p_cuenta, r.orden_id, r.linea, r.producto_id, r.variacion_id, r.sku, r.producto, r.variacion, r.cantidad, r.precio_proveedor,
    r.precio_proveedor_total
  from jsonb_to_recordset(p_filas) as r(orden_id bigint, linea int, producto_id bigint, variacion_id bigint, sku text, producto text,
    variacion text, cantidad numeric, precio_proveedor numeric, precio_proveedor_total numeric)
  where not exists (select 1 from public.dropi_orden_productos x where x.cuenta = p_cuenta and x.orden_id = r.orden_id)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.dropi_guardar_productos_mcp(text, jsonb) from public, anon, authenticated;
grant execute on function public.dropi_guardar_productos_mcp(text, jsonb) to service_role;

create or replace function public.dropi_sync_resultado(p_cuenta text, p_error text, p_resumen jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.dropi_conexion set ultima_sync = case when p_error is null then now() else ultima_sync end,
    ultimo_error = p_error, resumen = p_resumen where cuenta = p_cuenta;
$$;
revoke all on function public.dropi_sync_resultado(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.dropi_sync_resultado(text, text, jsonb) to service_role;

-- Cuáles de estas órdenes aún no tienen productos (para pedirle a Dropi el detalle solo de esas).
create or replace function public.dropi_ordenes_sin_productos(p_cuenta text, p_ids bigint[]) returns bigint[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(x.id order by x.id desc), '{}') from unnest(p_ids) x(id)
  where not exists (select 1 from public.dropi_orden_productos p where p.cuenta = p_cuenta and p.orden_id = x.id);
$$;
revoke all on function public.dropi_ordenes_sin_productos(text, bigint[]) from public, anon, authenticated;
grant execute on function public.dropi_ordenes_sin_productos(text, bigint[]) to service_role;
