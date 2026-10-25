-- ▶️ Ecuador también crea en Effi, pero solo cuando el dueño lo pide: "Ejecutar ahora" (todo lo listo) o "Ejecutar"
-- en una orden. En Ecuador la mayoría de remisiones las hace una persona, así que una orden puede estar lista solo
-- para la guía (plan.remision_existente). El modo Automático sigue montado solo para Guatemala.

create or replace function public.auto_decidir(p_cuenta text, p_sucursal integer, p_id integer, p_decision text)
returns void language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño puede decidir'; end if;
  if p_decision = 'ejecutar' then
    if p_cuenta not in ('TIENDA_GT', 'TIENDA_EC') then raise exception 'La creación no está montada para este país'; end if;
    select * into o from public.auto_ordenes where cuenta = p_cuenta and sucursal = p_sucursal and id = p_id;
    if o is null or o.plan_estado not in ('lista', 'error') or o.plan is null
       or (o.plan->'remision' is null and (o.plan->'remision_existente' is null or o.plan->'guia' is null)) then
      raise exception 'Esta orden no tiene nada listo para crear';
    end if;
  end if;
  update public.auto_ordenes
  set decision = p_decision, decision_en = case when p_decision is null then null else now() end,
      decision_por = case when p_decision is null then null else (select email from auth.users where id = auth.uid()) end
  where cuenta = p_cuenta and sucursal = p_sucursal and id = p_id;
  if p_decision = 'ejecutar' then
    perform public.auto_evento(p_cuenta, p_sucursal, p_id, 'inicio', null,
      'Orden enviada a crear por ' || coalesce((select email from auth.users where id = auth.uid()), 'el dueño'));
    perform net.http_post(
      url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-convertir?cuenta=' || p_cuenta || '&crear=' || p_sucursal || '-' || p_id,
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  end if;
end $$;

-- "Ejecutar ahora": crea lo que esté listo en ese momento, también en Manual (ahora=1).
create or replace function public.auto_ejecutar_ahora(p_cuenta text) returns text
language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño puede ejecutar el agente'; end if;
  if p_cuenta not in ('TIENDA_GT', 'TIENDA_EC') then raise exception 'La creación no está montada para este país'; end if;
  select modo, corriendo_hasta into c from public.auto_config where cuenta = p_cuenta;
  if not found then raise exception 'El agente de esta cuenta no está montado'; end if;
  if c.modo not in ('simular', 'automatico') then raise exception 'El agente no está corriendo en esta cuenta'; end if;
  if c.corriendo_hasta is not null and c.corriendo_hasta > now() then return 'ocupado'; end if;
  perform public.auto_evento(p_cuenta, null, null, 'inicio', null,
    'Ejecutar ahora pedido por ' || coalesce((select email from auth.users where id = auth.uid()), 'el dueño'));
  perform net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-convertir?cuenta=' || p_cuenta || '&ahora=1',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 10000);
  return 'iniciada';
end $$;
