-- Informes programados por correo: a quién, de qué sociedad y con qué asunto. Los destinatarios se cargan por SQL (no en
-- el repositorio, que es público) y solo el servidor puede leerlos (sin políticas: RLS cierra todo menos service_role).
create table public.informe_programado (
  id text primary key,
  activo boolean not null default true,
  destinatarios text[] not null,
  sociedad text,                       -- null = todas las tiendas con movimiento
  dias_atras integer not null default 1, -- 1 = el día anterior completo
  asunto text not null,                -- se le agrega la fecha del día de envío (hora Colombia)
  actualizado_en timestamptz not null default now()
);
alter table public.informe_programado enable row level security;

-- Dispara un informe programado (cron): la función informe-diario lee su configuración y lo envía.
create or replace function public.informe_programado_enviar(p_id text) returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/informe-diario?programado=' || p_id,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 60000)
  where exists (select 1 from public.informe_programado where id = p_id and activo);
$$;
revoke all on function public.informe_programado_enviar(text) from public, anon, authenticated;

-- Informe de Joalix todos los días a las 8:00 a. m. hora Colombia (13:00 UTC, sin horario de verano).
select cron.schedule('informe-joalix-8am', '0 13 * * *', $$ select public.informe_programado_enviar('joalix_diario'); $$);
