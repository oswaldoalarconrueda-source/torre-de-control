-- ▶️ "Ejecutar ahora" en el Agente: el dueño dispara la corrida del horario en el momento, sin esperar los 10 minutos.
-- Es la misma corrida del cron (en Automático crea remisión y guía; en Manual solo arma lo que haría). Si ya hay una
-- corrida en curso no lanza otra.
create or replace function public.auto_ejecutar_ahora(p_cuenta text) returns text
language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño puede ejecutar el agente'; end if;
  select modo, corriendo_hasta into c from public.auto_config where cuenta = p_cuenta;
  if not found then raise exception 'El agente de esta cuenta no está montado'; end if;
  if c.modo not in ('simular', 'automatico') then raise exception 'El agente no está corriendo en esta cuenta'; end if;
  if c.corriendo_hasta is not null and c.corriendo_hasta > now() then return 'ocupado'; end if;
  perform net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-convertir?cuenta=' || p_cuenta,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 10000);
  return 'iniciada';
end $$;
revoke all on function public.auto_ejecutar_ahora(text) from public, anon;
grant execute on function public.auto_ejecutar_ahora(text) to authenticated;
