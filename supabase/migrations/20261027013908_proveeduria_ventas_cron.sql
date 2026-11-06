create or replace function public.prov_refrescar_ventas() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/proveeduria?solo=ventas',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 150000);
$$;
revoke all on function public.prov_refrescar_ventas() from public, anon, authenticated;
select cron.schedule('proveeduria-ventas-10min', '5,15,25,35,45,55 * * * *', $$ select public.prov_refrescar_ventas(); $$);
