-- Drop (soydrop, A un clic Honduras y El Salvador) por su MCP oficial (api.soydrop.com/mcp, OAuth), 18-nov-2026.
-- Igual que Dropi: el dueño autoriza una vez (scripts/autorizar-drop.mjs, solo permisos de lectura) y el permiso
-- (client_id + refresh_token) queda cifrado en el Vault; la sincronización lo renueva sola.

create table if not exists public.drop_conexion (
  cuenta text primary key references public.effi_accounts (slug),
  guardado_en timestamptz not null default now(),
  ultima_sync timestamptz,
  ultimo_error text,
  resumen jsonb
);
alter table public.drop_conexion enable row level security;

create or replace function public.drop_guardar_oauth(p_sync text, p_cuenta text, p_oauth jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare v uuid; nombre text;
begin
  if not coalesce(public.effi_check_sync_token(p_sync), false) then raise exception 'Token de sincronización inválido'; end if;
  if p_cuenta not in ('AUNCLIC_HN', 'AUNCLIC_SV') then raise exception 'Tienda no permitida: %', p_cuenta; end if;
  if coalesce(p_oauth->>'refresh_token', '') = '' or coalesce(p_oauth->>'client_id', '') = '' then raise exception 'Falta refresh_token o client_id'; end if;
  nombre := 'drop_oauth_' || lower(p_cuenta);
  select id into v from vault.secrets where name = nombre;
  if v is null then perform vault.create_secret(p_oauth::text, nombre);
  else perform vault.update_secret(v, p_oauth::text, nombre); end if;
  insert into public.drop_conexion (cuenta, guardado_en) values (p_cuenta, now())
  on conflict (cuenta) do update set guardado_en = now(), ultimo_error = null;
  return nombre;
end $$;
revoke all on function public.drop_guardar_oauth(text, text, jsonb) from public, authenticated;
grant execute on function public.drop_guardar_oauth(text, text, jsonb) to anon, service_role;

create or replace function public.drop_oauth(p_cuenta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select decrypted_secret::jsonb from vault.decrypted_secrets where name = 'drop_oauth_' || lower(p_cuenta);
$$;
create or replace function public.drop_oauth_actualizar(p_cuenta text, p_oauth jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select id into v from vault.secrets where name = 'drop_oauth_' || lower(p_cuenta);
  if v is null then raise exception 'Sin permiso guardado para %', p_cuenta; end if;
  perform vault.update_secret(v, p_oauth::text);
end $$;
revoke all on function public.drop_oauth(text) from public, anon, authenticated;
revoke all on function public.drop_oauth_actualizar(text, jsonb) from public, anon, authenticated;
grant execute on function public.drop_oauth(text), public.drop_oauth_actualizar(text, jsonb) to service_role;
