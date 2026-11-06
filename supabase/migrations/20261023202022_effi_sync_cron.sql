create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Dispara la función effi-sync con el token guardado en Vault.
create function public.effi_sync_disparar() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/effi-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
$$;

-- Encola un job (carga histórica / reconciliación) para todas las cuentas activas con API key.
create function public.effi_sync_encolar(p_recurso text, p_desde timestamptz, p_hasta timestamptz default now())
returns int language sql security definer set search_path = '' as $$
  with nuevos as (
    insert into public.effi_sync_jobs (cuenta, recurso, desde_utc, hasta_utc, avance_utc)
    select a.slug, p_recurso, p_desde, p_hasta, p_desde
    from public.effi_accounts a
    where a.activa
      and exists (select 1 from vault.secrets s where s.name = 'effi_api_key_' || a.slug)
      -- no duplicar un job igual que siga pendiente
      and not exists (select 1 from public.effi_sync_jobs j where j.cuenta = a.slug and j.recurso = p_recurso and j.estado = 'pendiente')
    returning 1
  )
  select count(*)::int from nuevos;
$$;

do $$
declare f text;
begin
  foreach f in array array['effi_sync_disparar()','effi_sync_encolar(text, timestamptz, timestamptz)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Sync incremental cada 2 minutos (el candado evita corridas simultáneas).
select cron.schedule('effi-sync', '*/2 * * * *', $$ select public.effi_sync_disparar(); $$);

-- Cada hora: refrescar el estado de las novedades que requieren solución (últimos 3 días).
select cron.schedule('effi-novedades-hora', '7 * * * *', $$ select public.effi_sync_encolar('novedades_2', now() - interval '3 days'); $$);

-- Cada noche (02:00 Colombia): reconciliar guías (fecha estado final, liquidaciones), novedades y wallet.
select cron.schedule('effi-reconciliacion-noche', '0 7 * * *', $$
  select public.effi_sync_encolar('guias', now() - interval '45 days');
  select public.effi_sync_encolar('novedades_2', now() - interval '15 days');
  select public.effi_sync_encolar('novedades_1', now() - interval '3 days');
  select public.effi_sync_encolar('wallet', now() - interval '3 days');
$$);
