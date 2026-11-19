-- icomfly por API (A un clic Honduras y El Salvador, 17-nov-2026): la función icomfly-sync trae cada hora los pedidos de los
-- últimos 45 días de cada tienda y los guarda en icomfly_pedidos, igual que el archivo «icomfly · Pedidos» (mismo id "#8665",
-- una fila por producto, huella del cliente igual). Luego cruza el producto con las órdenes de Drop (drop_conciliar).
-- Datos de icomfly que el archivo no traía: estado logístico y fechas de envío, entrega y devolución.

alter table public.icomfly_pedidos
  add column if not exists api_id bigint,
  add column if not exists tracking_status text,
  add column if not exists enviado_en timestamptz,
  add column if not exists entregado_en timestamptz,
  add column if not exists devuelto_en timestamptz,
  add column if not exists fuente text not null default 'archivo';

-- Guardar una tanda de líneas (service_role). Reemplaza las líneas de cada pedido que viene en la tanda.
create or replace function public.icomfly_guardar_pedidos(p_cuenta text, p_filas jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_cuenta not in ('AUNCLIC_HN', 'AUNCLIC_SV') then raise exception 'Tienda no permitida: %', p_cuenta; end if;
  delete from public.icomfly_pedidos p
  where p.cuenta = p_cuenta and p.id in (select distinct f->>'id' from jsonb_array_elements(p_filas) f);
  insert into public.icomfly_pedidos (cuenta, id, linea, fecha, hora, origen, plataforma_envio, departamento, municipio, producto,
    cantidad, total, recaudo, pasarela, costo_producto, costo_envio, estado, guia, transportadora, etiquetas, motivo_cancelacion,
    fecha_cancelacion, cliente_hash, api_id, tracking_status, enviado_en, entregado_en, devuelto_en, fuente, actualizado_en)
  select p_cuenta, f->>'id', (f->>'linea')::int, (f->>'fecha')::date, f->>'hora', f->>'origen', f->>'plataforma_envio',
    f->>'departamento', f->>'municipio', f->>'producto', (f->>'cantidad')::numeric, (f->>'total')::numeric, f->>'recaudo',
    f->>'pasarela', (f->>'costo_producto')::numeric, (f->>'costo_envio')::numeric, f->>'estado', f->>'guia', f->>'transportadora',
    f->>'etiquetas', f->>'motivo_cancelacion', (f->>'fecha_cancelacion')::date, f->>'cliente_hash', (f->>'api_id')::bigint,
    f->>'tracking_status', (f->>'enviado_en')::timestamptz, (f->>'entregado_en')::timestamptz, (f->>'devuelto_en')::timestamptz,
    'api', now()
  from jsonb_array_elements(p_filas) f
  on conflict (cuenta, id, linea) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.icomfly_guardar_pedidos(text, jsonb) from public, anon, authenticated;
grant execute on function public.icomfly_guardar_pedidos(text, jsonb) to service_role;

-- Resultado de cada sincronización (para Estado de los datos y alertas).
create or replace function public.icomfly_sync_resultado(p_cuenta text, p_error text, p_resumen jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.icomfly_conexion set ultima_sync = case when p_error is null then now() else ultima_sync end,
    ultimo_error = p_error, prueba = coalesce(prueba, '{}'::jsonb) || jsonb_build_object('ultima', p_resumen)
  where cuenta = p_cuenta;
$$;
revoke all on function public.icomfly_sync_resultado(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.icomfly_sync_resultado(text, text, jsonb) to service_role;

-- El mismo cruce de drop_conciliar, para la sincronización (sin sesión de dueño): drop_conciliar_sistema(cuenta).
do $do$
declare f text;
begin
  f := pg_get_functiondef('public.drop_conciliar(text)'::regprocedure);
  f := replace(f, 'FUNCTION public.drop_conciliar(', 'FUNCTION public.drop_conciliar_sistema(');
  f := replace(f, $x$  if not public.app_es_owner() then raise exception 'Solo el dueño puede conciliar'; end if;$x$, '');
  if position('app_es_owner' in f) > 0 then raise exception 'No se pudo quitar el chequeo de dueño'; end if;
  execute f;
end $do$;
revoke all on function public.drop_conciliar_sistema(text) from public, anon, authenticated;
grant execute on function public.drop_conciliar_sistema(text) to service_role;

-- Cada hora (minuto 35): últimos 30 días de las dos tiendas y cruce con Drop. El historial desde agosto se cargó por tramos.
select cron.schedule('icomfly-sync', '35 * * * *', $c$
  select net.http_post(url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/icomfly-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 120000); $c$);
