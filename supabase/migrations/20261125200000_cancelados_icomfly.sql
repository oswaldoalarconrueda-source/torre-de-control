-- Pedidos cancelados en icomfly con guía de Effi (pedido del dueño, 25-nov-2026): cuando el cliente pide cancelar por el chat,
-- el bot o la asesora pasan el pedido a «Cancelado» en icomfly. Si la guía de Effi todavía no salió, sale un aviso (pop-up)
-- para anularla antes del despacho. La API de icomfly no trae los mensajes que escribe el cliente, solo el estado del pedido.

-- 1. Al recargar un pedido, si icomfly ya no manda la guía (pedido cancelado), se conserva la que tenía.
create or replace function public.icomfly_guardar_pedidos(p_cuenta text, p_filas jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare n int;
begin
  if p_cuenta not in ('AUNCLIC_HN', 'AUNCLIC_SV', 'TIENDA_CO') then raise exception 'Tienda no permitida: %', p_cuenta; end if;
  create temp table if not exists _icom_guias (id text, linea int, guia text, transportadora text) on commit drop;
  truncate _icom_guias;
  insert into _icom_guias
  select p.id, p.linea, p.guia, p.transportadora from public.icomfly_pedidos p
  where p.cuenta = p_cuenta and nullif(btrim(p.guia), '') is not null
    and p.id in (select distinct f->>'id' from jsonb_array_elements(p_filas) f);
  delete from public.icomfly_pedidos p
  where p.cuenta = p_cuenta and p.id in (select distinct f->>'id' from jsonb_array_elements(p_filas) f);
  insert into public.icomfly_pedidos (cuenta, id, linea, fecha, hora, origen, plataforma_envio, departamento, municipio, producto,
    cantidad, total, recaudo, pasarela, costo_producto, costo_envio, estado, guia, transportadora, etiquetas, motivo_cancelacion,
    fecha_cancelacion, cliente_hash, api_id, tracking_status, enviado_en, entregado_en, devuelto_en, fuente, actualizado_en, drop_order_id)
  select p_cuenta, f->>'id', (f->>'linea')::int, (f->>'fecha')::date, f->>'hora', f->>'origen', f->>'plataforma_envio',
    f->>'departamento', f->>'municipio', f->>'producto', (f->>'cantidad')::numeric, (f->>'total')::numeric, f->>'recaudo',
    f->>'pasarela', (f->>'costo_producto')::numeric, (f->>'costo_envio')::numeric, f->>'estado',
    coalesce(nullif(btrim(f->>'guia'), ''), v.guia), coalesce(nullif(btrim(f->>'transportadora'), ''), v.transportadora),
    f->>'etiquetas', f->>'motivo_cancelacion', (f->>'fecha_cancelacion')::date, f->>'cliente_hash', (f->>'api_id')::bigint,
    f->>'tracking_status', (f->>'enviado_en')::timestamptz, (f->>'entregado_en')::timestamptz, (f->>'devuelto_en')::timestamptz,
    'api', now(), f->>'drop_order_id'
  from jsonb_array_elements(p_filas) f
  left join _icom_guias v on v.id = f->>'id' and v.linea = (f->>'linea')::int
  on conflict (cuenta, id, linea) do nothing;
  get diagnostics n = row_count;
  return n;
end $function$;

-- 2. Lo que una persona decidió con cada aviso.
create table if not exists public.cancelados_gestion (
  cuenta text not null references public.effi_accounts(slug),
  guia text not null,
  sucursal integer,
  id_guia integer,
  pedido text,
  decision text not null check (decision in ('anulando', 'anulada', 'ya_salio', 'gestionado')),
  decision_por text,
  decision_en timestamptz not null default now(),
  mensaje text,
  primary key (cuenta, guia)
);
alter table public.cancelados_gestion enable row level security;

-- 3. Avisos: pedidos cancelados en icomfly (últimos 10 días) cuya guía de Effi sigue vigente. «sin_salir» = la guía sigue
-- generada (sin tránsito); la relación de despacho se revisa en Effi justo antes de anular.
create or replace function public.cancelados_pendientes()
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  with vis as (select unnest(public.app_cuentas_visibles('automatizacion')) as cuenta),
  c as (
    select distinct on (p.cuenta, p.guia) p.cuenta, p.id as pedido, btrim(p.guia) as guia, p.motivo_cancelacion as motivo,
      coalesce(p.fecha_cancelacion, p.fecha) as cancelado, p.actualizado_en
    from public.icomfly_pedidos p
    where p.cuenta in (select cuenta from vis) and p.estado = 'Cancelado' and nullif(btrim(p.guia), '') is not null
      and coalesce(p.fecha_cancelacion, p.fecha) >= current_date - 10
      and coalesce(p.motivo_cancelacion, '') not ilike 'prueba%'
    order by p.cuenta, p.guia, p.actualizado_en desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'cuenta', c.cuenta, 'pedido', c.pedido, 'guia', c.guia, 'motivo', c.motivo, 'cancelado', c.cancelado,
      'sucursal', g.sucursal, 'id_guia', g.id, 'cliente', g.nombre_destinatario, 'ciudad', g.nombre_ciudad_destinatario,
      'valor', g.valor_recaudo, 'transportadora', split_part(g.nombre_transportadora_efficommerce, ' ', 1),
      'estado_guia', g.estado_efficommerce, 'sin_salir', coalesce(g.est_guia_efficommerce, 1) = 1, 'creada', g.fecha_trans,
      'remision', g.id_ref, 'decision', d.decision, 'mensaje', d.mensaje, 'decision_por', d.decision_por, 'decision_en', d.decision_en)
    order by (coalesce(g.est_guia_efficommerce, 1) = 1) desc, c.cancelado desc), '[]'::jsonb)
  from c
  join public.effi_guias g on g.cuenta = c.cuenta and g.guia = c.guia and g.fecha_anular is null and g.vigente is not false
    and coalesce(g.est_guia_efficommerce, 1) not in (4, 5)
  left join public.cancelados_gestion d on d.cuenta = c.cuenta and d.guia = c.guia
  where d.decision is null or d.decision in ('anulando', 'ya_salio') and d.decision_en > now() - interval '1 day';
$function$;

-- 4. La persona decide: «anular» (el agente revisa la relación de despacho en Effi y anula la guía) o «gestionado».
create or replace function public.cancelado_decidir(p_cuenta text, p_guia text, p_decision text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare g record; v_email text := (select auth.jwt()->>'email');
begin
  if not (public.app_es_owner() or p_cuenta = any (public.app_cuentas_visibles('automatizacion'))) then
    raise exception 'No tienes permiso en este país'; end if;
  if p_decision not in ('anular', 'gestionado') then raise exception 'Decisión inválida'; end if;
  select gg.sucursal, gg.id, gg.est_guia_efficommerce into g from public.effi_guias gg
  where gg.cuenta = p_cuenta and gg.guia = p_guia and gg.fecha_anular is null and gg.vigente is not false;
  if not found then raise exception 'La guía % ya no está vigente en Effi', p_guia; end if;
  if p_decision = 'anular' and exists (select 1 from public.cancelados_gestion d where d.cuenta = p_cuenta and d.guia = p_guia
       and d.decision = 'anulando' and d.decision_en > now() - interval '3 minutes') then
    raise exception 'Esta guía ya se está anulando'; end if;
  insert into public.cancelados_gestion (cuenta, guia, sucursal, id_guia, pedido, decision, decision_por, decision_en, mensaje)
  values (p_cuenta, p_guia, g.sucursal, g.id,
          (select p.id from public.icomfly_pedidos p where p.cuenta = p_cuenta and btrim(p.guia) = p_guia limit 1),
          case when p_decision = 'anular' then 'anulando' else 'gestionado' end, v_email, now(), null)
  on conflict (cuenta, guia) do update set decision = excluded.decision, decision_por = excluded.decision_por,
    decision_en = now(), mensaje = null;
  if p_decision = 'anular' then
    perform net.http_post(
      url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-convertir?cuenta=' || p_cuenta || '&anular_cancelada=' || g.sucursal || '-' || g.id,
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  end if;
end $function$;

-- 5. Resultado de la anulación (lo llama auto-convertir).
create or replace function public.cancelado_resultado(p_cuenta text, p_sucursal integer, p_id integer, p_decision text, p_mensaje text)
 returns void
 language sql
 security definer
 set search_path to ''
as $function$
  update public.cancelados_gestion set decision = p_decision, mensaje = p_mensaje, decision_en = now()
  where cuenta = p_cuenta and sucursal = p_sucursal and id_guia = p_id;
$function$;

revoke all on function public.cancelados_pendientes() from public, anon;
revoke all on function public.cancelado_decidir(text, text, text) from public, anon;
revoke all on function public.cancelado_resultado(text, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.cancelados_pendientes() to authenticated;
grant execute on function public.cancelado_decidir(text, text, text) to authenticated;
grant execute on function public.cancelado_resultado(text, integer, integer, text, text) to service_role;

-- 6. icomfly de Colombia cada 10 minutos (últimos 7 días), para que el aviso llegue a tiempo. La corrida de cada hora sigue igual.
select cron.unschedule('icomfly-co-10min') where exists (select 1 from cron.job where jobname = 'icomfly-co-10min');
select cron.schedule('icomfly-co-10min', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/icomfly-sync?cuenta=TIENDA_CO&cruce=0&desde='
      || to_char((now() at time zone 'America/Bogota')::date - 7, 'YYYY-MM-DD'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$cron$);
