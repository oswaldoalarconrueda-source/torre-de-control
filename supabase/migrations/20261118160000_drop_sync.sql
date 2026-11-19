-- Drop por MCP (A un clic Honduras y El Salvador), 18-nov-2026: la función drop-sync guarda lo que dice Drop en drop_mcp_ordenes
-- y aquí se pasa a las tablas de siempre (dropi_ordenes tienda='drop' y dropi_cartera).
-- Estados de Drop, comprobados contra los archivos de Honduras: 4 entregado · 8 devolución · 6 novedad · 2 y 3 en tránsito ·
-- 5 y cancelled cancelado · rejected rechazado · registered, fulfilled y pending_correction pendiente.
-- Los abonos cuadraron orden por orden con el archivo de billetera (4.316 de 4.316).
-- Nunca se borran órdenes del archivo: 554 de Honduras no salen en la API de Drop y sus fletes de devolución sí son reales.

create or replace function public.drop_estado_mcp(p_estado text, p_entregada boolean, p_abono numeric) returns text
language sql immutable set search_path = '' as $$
  select case
    when coalesce(p_entregada, false) or coalesce(p_abono, 0) > 0 or p_estado = '4' then 'ENTREGADO'
    when p_estado = '8' then 'DEVOLUCION'
    when p_estado = '6' then 'NOVEDAD'
    when p_estado in ('2', '3') then 'EN TRANSITO'
    when p_estado in ('5', 'cancelled') then 'CANCELADO'
    when p_estado = 'rejected' then 'RECHAZADO'
    when p_estado in ('registered', 'fulfilled', 'pending_correction') then 'PENDIENTE'
    else upper(p_estado)
  end;
$$;

create or replace function public.drop_guardar_mcp(p_cuenta text, p_filas jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_n int; v_nuevas int; v_abonos int;
begin
  if p_cuenta not in ('AUNCLIC_HN', 'AUNCLIC_SV') then raise exception 'Tienda no permitida: %', p_cuenta; end if;

  -- 1) Lo que dice Drop, tal cual.
  insert into public.drop_mcp_ordenes as d (cuenta, id, fecha, hora, estado_drop, entregada, venta, abono, abonado_en, actualizado_en)
  select p_cuenta, r.id, r.fecha, r.hora, r.estado_drop, r.entregada, r.venta, r.abono, r.abonado_en, now()
  from jsonb_to_recordset(p_filas) as r(id bigint, fecha date, hora text, estado_drop text, entregada boolean, venta numeric, abono numeric, abonado_en timestamp)
  on conflict (cuenta, id) do update set fecha = excluded.fecha, hora = excluded.hora, estado_drop = excluded.estado_drop, entregada = excluded.entregada,
    venta = excluded.venta, abono = excluded.abono, abonado_en = excluded.abonado_en, actualizado_en = now();
  get diagnostics v_n = row_count;

  -- 2) Órdenes: las nuevas entran; en las existentes solo cambia el estado (venta, costo y producto no se tocan).
  select count(*) into v_nuevas from jsonb_to_recordset(p_filas) r(id bigint)
  where not exists (select 1 from public.dropi_ordenes o where o.cuenta = p_cuenta and o.id = r.id);

  insert into public.dropi_ordenes as d (cuenta, id, fecha, hora, estatus, tipo_envio, venta, ultimo_movimiento, fecha_ultimo_movimiento, tipo_tienda, tienda, recuperado, actualizado_en)
  select p_cuenta, m.id, m.fecha, m.hora, e.estatus, 'COD', m.venta, e.estatus, current_date, 'DROP', 'drop', false, now()
  from public.drop_mcp_ordenes m
  cross join lateral (select public.drop_estado_mcp(m.estado_drop, m.entregada, m.abono) as estatus) e
  where m.cuenta = p_cuenta and m.id in (select r.id from jsonb_to_recordset(p_filas) r(id bigint)) and m.fecha >= date '2026-08-01'
  on conflict (cuenta, id) do update set
    estatus = excluded.estatus,
    ultimo_movimiento = case when excluded.estatus is distinct from d.estatus then excluded.estatus else d.ultimo_movimiento end,
    fecha_ultimo_movimiento = case when excluded.estatus is distinct from d.estatus then current_date else d.fecha_ultimo_movimiento end,
    actualizado_en = case when excluded.estatus is distinct from d.estatus then now() else d.actualizado_en end;

  -- 3) Abonos: solo los que el archivo de billetera aún no trae. id negativo = −número de orden.
  insert into public.dropi_cartera as c (cuenta, id, fecha, tipo, monto, orden_id, descripcion)
  select p_cuenta, -m.id, coalesce(m.abonado_en, m.fecha::timestamp), 'ENTRADA', m.abono, m.id, 'ENTRADA POR GANANCIA · Drop (API): abono a la billetera'
  from public.drop_mcp_ordenes m
  where m.cuenta = p_cuenta and m.abono > 0 and m.id in (select r.id from jsonb_to_recordset(p_filas) r(id bigint))
    and not exists (select 1 from public.dropi_cartera x where x.cuenta = p_cuenta and x.orden_id = m.id and x.concepto = 'ganancia' and x.id > 0)
  on conflict (cuenta, id) do update set fecha = excluded.fecha, monto = excluded.monto;
  get diagnostics v_abonos = row_count;

  return jsonb_build_object('ordenes', v_n, 'nuevas', v_nuevas, 'abonos', v_abonos);
end $$;
revoke all on function public.drop_guardar_mcp(text, jsonb) from public, anon, authenticated;
grant execute on function public.drop_guardar_mcp(text, jsonb) to service_role;

-- Si llega el archivo de billetera con un abono que ya vino por la API, el del archivo lo reemplaza (no se duplica).
create or replace function public.drop_cartera_archivo_manda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.dropi_cartera c using nuevas n
  where n.id > 0 and n.concepto = 'ganancia' and c.id < 0 and c.cuenta = n.cuenta and c.orden_id = n.orden_id and c.concepto = 'ganancia';
  return null;
end $$;
drop trigger if exists drop_cartera_archivo_manda on public.dropi_cartera;
create trigger drop_cartera_archivo_manda after insert on public.dropi_cartera
  referencing new table as nuevas for each statement execute function public.drop_cartera_archivo_manda();

-- Wallet en vivo: el saldo sale del último movimiento del archivo (los abonos por API no traen saldo).
do $do$
declare f text; g text;
begin
  f := pg_get_functiondef('public.wallet_en_vivo(text[])'::regprocedure);
  g := replace(f, 'from dc d where d.slug = c.slug order by d.f desc, d.id desc limit 1) as saldo',
                  'from dc d where d.slug = c.slug and d.monto_previo is not null order by d.f desc, d.id desc limit 1) as saldo');
  if g = f then raise exception 'No se encontró el saldo de Drop en wallet_en_vivo'; end if;
  execute g;
end $do$;

-- Cada hora (minuto 50): lo más reciente y un tramo de la vuelta completa desde el 1 de agosto.
select cron.schedule('drop-sync', '50 * * * *', $c$
  select net.http_post(url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/drop-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 280000); $c$);
