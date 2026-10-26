-- "Pasar de remisión a guía": solo hace las guías de las remisiones ya hechas (en Ecuador las remisiones las hace una
-- persona porque la API de Effi falla al crearlas). Va en tandas de 10 hasta acabarlas, sin pasar por las órdenes.
create or replace function public.auto_pasar_a_guia(p_cuenta text) returns text
language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño puede ejecutar el agente'; end if;
  if p_cuenta not in ('TIENDA_GT', 'TIENDA_EC') then raise exception 'La creación no está montada para este país'; end if;
  select modo, corriendo_hasta into c from public.auto_config where cuenta = p_cuenta;
  if not found then raise exception 'El agente de esta cuenta no está montado'; end if;
  if c.corriendo_hasta is not null and c.corriendo_hasta > now() then return 'ocupado'; end if;
  perform public.auto_evento(p_cuenta, null, null, 'inicio', null,
    'Pasar de remisión a guía pedido por ' || coalesce((select email from auth.users where id = auth.uid()), 'el dueño'));
  perform net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-convertir?cuenta=' || p_cuenta || '&ahora=1&solo=guias',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 10000);
  return 'iniciada';
end $$;
revoke all on function public.auto_pasar_a_guia(text) from public, anon;
grant execute on function public.auto_pasar_a_guia(text) to authenticated;
