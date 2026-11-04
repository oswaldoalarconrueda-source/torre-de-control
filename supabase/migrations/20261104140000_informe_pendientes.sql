-- Informe de guías pendientes por despacho (regla del dueño, 4-nov): un correo por país, con un Excel por proveedor, a las 8:00
-- a. m. hora Colombia, de lunes a sábado (13:00 UTC, sin horario de verano). Los correos se cargan por SQL (no en el repositorio,
-- que es público) y solo el servidor puede leerlos (sin políticas: RLS cierra todo menos service_role).
create table public.informe_pendientes_destinos (
  cuenta text primary key,
  activo boolean not null default true,
  para text[] not null,
  copia text[] not null default '{}',
  ultimo_envio timestamptz,
  ultimo_error text,
  ultimo_resumen jsonb
);
alter table public.informe_pendientes_destinos enable row level security;

create or replace function public.informe_pendientes_enviar() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/informe-pendientes',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$$;
revoke all on function public.informe_pendientes_enviar() from public, anon, authenticated;

select cron.schedule('informe-pendientes-8am', '0 13 * * 1-6', $$ select public.informe_pendientes_enviar(); $$);
