-- 🔔 Notificaciones al celular (pedido del dueño, 17-nov-2026): el Centro de Control se instala en el iPhone como app
-- (pantalla de inicio) y recibe notificaciones push, también con el celular bloqueado.
--   app_push_suscripciones: cada celular o navegador que activó las alertas (lo que da el navegador al suscribirse).
--   app_push_cola: cada aviso por enviar; la función push (edge) lo manda a los celulares de la persona y anota el resultado.
--   Las llaves VAPID las genera la función push la primera vez y quedan en el Vault (push_vapid_publica / push_vapid_privada).
-- Las alertas (ventas, despacho, Meta, etc.) se irán agregando: cada una solo llama push_avisar(...).

create table if not exists public.app_push_suscripciones (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dispositivo text,
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  ultimo_envio timestamptz,
  ultimo_error text
);
alter table public.app_push_suscripciones enable row level security;

create table if not exists public.app_push_cola (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null,
  titulo text not null,
  cuerpo text,
  url text,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  enviados int,
  error text
);
create index if not exists app_push_cola_pendientes on public.app_push_cola (creado_en) where enviado_en is null;
alter table public.app_push_cola enable row level security;

-- Llaves VAPID en el Vault (solo la función push con service_role).
create or replace function public.push_claves() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'publica', (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_publica'),
    'privada', (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_privada'));
$$;
create or replace function public.push_guardar_claves(p_publica text, p_privada text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from vault.secrets where name = 'push_vapid_publica') then raise exception 'Las llaves ya existen'; end if;
  if coalesce(p_publica, '') = '' or coalesce(p_privada, '') = '' then raise exception 'Llaves vacías'; end if;
  perform vault.create_secret(p_publica, 'push_vapid_publica');
  perform vault.create_secret(p_privada, 'push_vapid_privada');
end $$;
revoke all on function public.push_claves() from public, anon, authenticated;
revoke all on function public.push_guardar_claves(text, text) from public, anon, authenticated;
grant execute on function public.push_claves() to service_role;
grant execute on function public.push_guardar_claves(text, text) to service_role;

-- La llave pública la necesita el navegador para suscribirse (no es secreta).
create or replace function public.push_clave_publica() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_publica' and auth.uid() is not null;
$$;
revoke all on function public.push_clave_publica() from public, anon;
grant execute on function public.push_clave_publica() to authenticated;

-- El celular de la persona que está en sesión.
create or replace function public.push_suscribir(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if p_endpoint !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then raise exception 'Suscripción inválida'; end if;
  insert into public.app_push_suscripciones (user_id, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    dispositivo = excluded.dispositivo, activa = true, ultimo_error = null;
end $$;

create or replace function public.push_desuscribir(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  update public.app_push_suscripciones set activa = false where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- Mis celulares y los últimos avisos (pantalla Mis alertas).
create or replace function public.push_mis_datos() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'dispositivos', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'dispositivo', s.dispositivo, 'creado_en', s.creado_en,
        'ultimo_envio', s.ultimo_envio, 'ultimo_error', s.ultimo_error) order by s.creado_en desc)
      from public.app_push_suscripciones s where s.user_id = auth.uid() and s.activa), '[]'::jsonb),
    'avisos', coalesce((select jsonb_agg(x order by x.creado_en desc) from (
      select c.id, c.tipo, c.titulo, c.cuerpo, c.url, c.creado_en, c.enviado_en, c.enviados, c.error
      from public.app_push_cola c where c.user_id = auth.uid() order by c.creado_en desc limit 20) x), '[]'::jsonb));
$$;

-- Despierta a la función push para que mande lo pendiente ya (sin esperar la revisión de cada minuto).
create or replace function public.push_despachar() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 15000);
end $$;

-- Encolar un aviso. p_user null = a los dueños. Lo usan las alertas (service_role / funciones internas).
create or replace function public.push_avisar(p_tipo text, p_titulo text, p_cuerpo text default null, p_url text default null, p_user uuid default null)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.app_push_cola (user_id, tipo, titulo, cuerpo, url)
  select u.user_id, p_tipo, left(p_titulo, 120), left(p_cuerpo, 400), p_url
  from public.app_usuarios u
  where u.activo and u.user_id is not null and (case when p_user is null then u.rol = 'owner' else u.user_id = p_user end)
    and exists (select 1 from public.app_push_suscripciones s where s.user_id = u.user_id and s.activa);
  get diagnostics n = row_count;
  if n > 0 then perform public.push_despachar(); end if;
  return n;
end $$;
revoke all on function public.push_avisar(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.push_despachar() from public, anon, authenticated;
grant execute on function public.push_avisar(text, text, text, text, uuid) to service_role;

-- Botón "Enviar prueba" de Mis alertas: un aviso a mis propios celulares.
create or replace function public.push_probar() returns int
language sql security definer set search_path = '' as $$
  select public.push_avisar('prueba', '🔔 Prueba del Centro de Control',
    'Así te van a llegar las alertas, también con el celular bloqueado.', '/alertas', auth.uid())
  where auth.uid() is not null;
$$;

-- Para la función push (service_role): lo pendiente, con los celulares de cada persona, y anotar el resultado.
create or replace function public.push_pendientes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'tipo', c.tipo, 'titulo', c.titulo, 'cuerpo', c.cuerpo, 'url', c.url,
    'suscripciones', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
                      from public.app_push_suscripciones s where s.user_id = c.user_id and s.activa))), '[]'::jsonb)
  from (select * from public.app_push_cola where enviado_en is null and creado_en > now() - interval '6 hours' order by creado_en limit 100) c;
$$;
create or replace function public.push_resultado(p_cola bigint, p_enviados int, p_error text, p_malas bigint[] default '{}', p_bien bigint[] default '{}')
returns void language sql security definer set search_path = '' as $$
  update public.app_push_cola set enviado_en = now(), enviados = p_enviados, error = p_error where id = p_cola;
  update public.app_push_suscripciones set activa = false, ultimo_error = coalesce(p_error, 'vencida') where id = any (p_malas);
  update public.app_push_suscripciones set ultimo_envio = now(), ultimo_error = null where id = any (p_bien);
$$;
revoke all on function public.push_pendientes() from public, anon, authenticated;
revoke all on function public.push_resultado(bigint, int, text, bigint[], bigint[]) from public, anon, authenticated;
grant execute on function public.push_pendientes() to service_role;
grant execute on function public.push_resultado(bigint, int, text, bigint[], bigint[]) to service_role;

revoke all on function public.push_suscribir(text, text, text, text) from public, anon;
revoke all on function public.push_desuscribir(text) from public, anon;
revoke all on function public.push_mis_datos() from public, anon;
revoke all on function public.push_probar() from public, anon;
grant execute on function public.push_suscribir(text, text, text, text) to authenticated;
grant execute on function public.push_desuscribir(text) to authenticated;
grant execute on function public.push_mis_datos() to authenticated;
grant execute on function public.push_probar() to authenticated;

-- Por si un aviso no salió al momento (la función estaba ocupada o falló): cada minuto, solo si hay pendientes.
select cron.schedule('push-pendientes', '* * * * *',
  $c$ select public.push_despachar() where exists (select 1 from public.app_push_cola where enviado_en is null and creado_en > now() - interval '6 hours'); $c$);
