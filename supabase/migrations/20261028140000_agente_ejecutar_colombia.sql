-- Colombia: botón "Ejecutar ahora" al lado del modo Manual (pedido del dueño, 28-oct, órdenes que no aparecían listas).
-- En Colombia la creación es orden por orden, así que aquí "Ejecutar ahora" corre la misma pasada del horario en el
-- momento: trae las órdenes, las prepara (remisión y guía con transportadora) y manda las de oficina que van solas.
-- Guatemala y Ecuador siguen igual: además crean en tanda lo que esté listo (&ahora=1).
create or replace function public.auto_ejecutar_ahora(p_cuenta text) returns text
language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño puede ejecutar el agente'; end if;
  if p_cuenta not in ('TIENDA_GT', 'TIENDA_EC', 'TIENDA_CO') then raise exception 'La creación no está montada para este país'; end if;
  select modo, corriendo_hasta into c from public.auto_config where cuenta = p_cuenta;
  if not found then raise exception 'El agente de esta cuenta no está montado'; end if;
  if c.modo not in ('simular', 'automatico') then raise exception 'El agente no está corriendo en esta cuenta'; end if;
  if c.corriendo_hasta is not null and c.corriendo_hasta > now() then return 'ocupado'; end if;
  perform public.auto_evento(p_cuenta, null, null, 'inicio', null,
    'Ejecutar ahora pedido por ' || coalesce((select email from auth.users where id = auth.uid()), 'el dueño'));
  -- Vigilancia primero (trae las órdenes nuevas de Effi) y luego la preparación.
  perform public.auto_vigilancia_disparar();
  perform net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-convertir?cuenta=' || p_cuenta
      || case when p_cuenta = 'TIENDA_CO' then '' else '&ahora=1' end,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 10000);
  return 'iniciada';
end $$;
