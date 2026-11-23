-- TikTok Ads (Marketing API) para A un clic, 22-nov-2026, primera parte: la conexión.
-- 1. El dueño guarda el App ID y el Secret de su app de TikTok en el Vault con scripts/guardar-tiktok.sh (pasa por la
--    función tiktok-auth con EFFI_SYNC_TOKEN; nunca quedan en el repo ni en el .env).
-- 2. En /tiktok pulsa «Conectar TikTok»: tiktok_iniciar arma el enlace de autorización con un estado de un solo uso.
-- 3. TikTok devuelve el permiso (auth_code) a la función tiktok-auth, que lo cambia por el token de acceso, lo guarda en el
--    Vault y registra las cuentas publicitarias autorizadas en tiktok_cuentas. Nadie copia ni pega tokens.

-- Los secretos de TikTok se suman a los que se pueden guardar.
create or replace function public.app_guardar_secreto(p_nombre text, p_valor text) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if p_nombre not in ('gmail_user', 'gmail_app_password', 'tiktok_app_id', 'tiktok_app_secret', 'tiktok_access_token')
     and p_nombre !~ '^meta_access_token(_[a-z0-9]+)?$' then
    raise exception 'Secreto no permitido: %', p_nombre;
  end if;
  if coalesce(btrim(p_valor), '') = '' then raise exception 'Valor vacío'; end if;
  select id into v from vault.secrets where name = p_nombre;
  if v is null then perform vault.create_secret(p_valor, p_nombre);
  else perform vault.update_secret(v, p_valor, p_nombre); end if;
end $$;
revoke all on function public.app_guardar_secreto(text, text) from public, anon, authenticated;
grant execute on function public.app_guardar_secreto(text, text) to service_role;

-- Estado de un solo uso para la autorización (dura 30 minutos) y a qué Centro de Control se vuelve.
create table if not exists public.tiktok_estado_auth (
  estado text primary key,
  creado_por uuid,
  volver text not null,
  creado_en timestamptz not null default now(),
  usado_en timestamptz
);
alter table public.tiktok_estado_auth enable row level security;

-- Cuentas publicitarias de TikTok autorizadas y a qué tienda de A un clic van.
create table if not exists public.tiktok_cuentas (
  advertiser_id text primary key,
  nombre text,
  divisa text,
  zona_horaria text,
  tienda text,
  activo boolean not null default true,
  autorizado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table public.tiktok_cuentas enable row level security;

create or replace function public.tiktok_credenciales() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'app_id', (select decrypted_secret from vault.decrypted_secrets where name = 'tiktok_app_id'),
    'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tiktok_app_secret'),
    'token', (select decrypted_secret from vault.decrypted_secrets where name = 'tiktok_access_token'));
$$;
revoke all on function public.tiktok_credenciales() from public, anon, authenticated;
grant execute on function public.tiktok_credenciales() to service_role;

-- Solo el dueño: arma el enlace de autorización de TikTok. Solo se vuelve al Centro de Control (en línea o localhost).
create or replace function public.tiktok_iniciar(p_volver text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_app text; v_estado text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño conecta TikTok'; end if;
  if p_volver !~ '^(https://torre-de-control-inky\.vercel\.app|http://localhost:3000)$' then raise exception 'Dirección de regreso no permitida'; end if;
  select decrypted_secret into v_app from vault.decrypted_secrets where name = 'tiktok_app_id';
  if v_app is null then raise exception 'Primero guarda el App ID y el Secret de la app de TikTok (scripts/guardar-tiktok.sh)'; end if;
  delete from public.tiktok_estado_auth where creado_en < now() - interval '1 day';
  insert into public.tiktok_estado_auth (estado, creado_por, volver) values (v_estado, auth.uid(), p_volver);
  return 'https://business-api.tiktok.com/portal/auth?app_id=' || v_app || '&state=' || v_estado
    || '&redirect_uri=' || replace(replace('https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/tiktok-auth', ':', '%3A'), '/', '%2F');
end $$;
revoke all on function public.tiktok_iniciar(text) from public, anon;
grant execute on function public.tiktok_iniciar(text) to authenticated;

-- La función tiktok-auth gasta el estado (una sola vez, máximo 30 minutos) y sabe a dónde volver.
create or replace function public.tiktok_usar_estado(p_estado text) returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  update public.tiktok_estado_auth set usado_en = now()
  where estado = p_estado and usado_en is null and creado_en > now() - interval '30 minutes'
  returning volver into v;
  return v;
end $$;
revoke all on function public.tiktok_usar_estado(text) from public, anon, authenticated;
grant execute on function public.tiktok_usar_estado(text) to service_role;

create or replace function public.tiktok_guardar_cuentas(p_cuentas jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.tiktok_cuentas (advertiser_id, nombre, divisa, zona_horaria)
  select c->>'advertiser_id', c->>'nombre', c->>'divisa', c->>'zona_horaria' from jsonb_array_elements(p_cuentas) c
  on conflict (advertiser_id) do update set nombre = excluded.nombre, divisa = coalesce(excluded.divisa, tiktok_cuentas.divisa),
    zona_horaria = coalesce(excluded.zona_horaria, tiktok_cuentas.zona_horaria), activo = true, actualizado_en = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.tiktok_guardar_cuentas(jsonb) from public, anon, authenticated;
grant execute on function public.tiktok_guardar_cuentas(jsonb) to service_role;

-- Solo el dueño: cómo va la conexión (sin mostrar ningún secreto).
create or replace function public.tiktok_estado() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño'; end if;
  return jsonb_build_object(
    'app', exists (select 1 from vault.secrets where name = 'tiktok_app_id') and exists (select 1 from vault.secrets where name = 'tiktok_app_secret'),
    'token', exists (select 1 from vault.secrets where name = 'tiktok_access_token'),
    'token_en', (select updated_at from vault.secrets where name = 'tiktok_access_token'),
    'cuentas', coalesce((select jsonb_agg(jsonb_build_object('advertiser_id', advertiser_id, 'nombre', nombre, 'divisa', divisa,
        'zona_horaria', zona_horaria, 'tienda', tienda, 'activo', activo, 'autorizado_en', autorizado_en) order by nombre)
      from public.tiktok_cuentas), '[]'::jsonb));
end $$;
revoke all on function public.tiktok_estado() from public, anon;
grant execute on function public.tiktok_estado() to authenticated;
