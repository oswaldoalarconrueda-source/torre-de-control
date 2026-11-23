-- Regla del dueño (23-nov-2026): en Joalix todo va con convenio y el remitente de la guía sale del convenio. La orden o la
-- remisión sin convenio queda en error (auto-convertir) para que la atienda una persona. «Ejecutar» en una orden en error
-- sin remisión armada (por ejemplo, ya le pusieron el convenio en Effi) la vuelve a preparar, igual que en revisión.
create or replace function public.auto_preparar_orden(p_cuenta text, p_sucursal integer, p_id integer)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare o record;
begin
  if not (public.app_es_owner() or p_cuenta = any (public.app_cuentas_visibles('automatizacion'))) then
    raise exception 'No tienes permiso para ejecutar en este país'; end if;
  if p_cuenta not in (select a.slug from public.effi_accounts a where a.tipo = 'tienda') then raise exception 'La creación no está montada para este país'; end if;
  select * into o from public.auto_ordenes where cuenta = p_cuenta and sucursal = p_sucursal and id = p_id;
  if o is null then raise exception 'Esta orden todavía no está en el Centro de Control'; end if;
  if o.id_remision is not null then raise exception 'Esta orden ya tiene remisión'; end if;
  if o.orden_vigente is false then raise exception 'Esta orden está anulada en Effi'; end if;
  if coalesce((o.plan->>'abono')::boolean, false) then raise exception 'Pedido con abono: se hace a mano en Effi'; end if;
  if o.plan_estado is not null and not (o.plan_estado in ('revision', 'error') and o.plan->'remision' is null) then return; end if;
  perform net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-convertir?cuenta=' || p_cuenta || '&preparar=' || p_sucursal || '-' || p_id,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 90000);
end $function$;
