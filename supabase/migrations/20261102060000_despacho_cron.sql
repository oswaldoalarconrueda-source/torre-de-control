-- Despacho del Inicio: cada 15 minutos se refrescan los últimos 5 días y de madrugada los últimos 45 (una guía puede entrar a una
-- relación de despacho días después de creada). Ya con la pantalla nueva publicada, se quita la versión anterior del resumen.
create or replace function public.effi_despacho_refrescar(p_dias int default 5)
returns void
language sql security definer set search_path to ''
as $$
  select net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/effi-despacho?dias=' || p_dias,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 150000);
$$;
revoke all on function public.effi_despacho_refrescar(int) from public, anon, authenticated;

select cron.schedule('effi-despacho-15min', '*/15 * * * *', $$ select public.effi_despacho_refrescar(5); $$);
select cron.schedule('effi-despacho-madrugada', '10 8 * * *', $$ select public.effi_despacho_refrescar(45); $$);

drop function if exists public.app_inicio();
