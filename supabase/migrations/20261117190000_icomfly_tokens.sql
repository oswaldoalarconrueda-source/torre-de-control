-- icomfly (A un clic Honduras y El Salvador): un token de API (ik_live_) por tienda, guardado cifrado en el Vault.
-- Lo sube scripts/push-icomfly.mjs autenticándose con el token de sincronización (no hace falta desplegar funciones).
create table if not exists public.icomfly_conexion (
  cuenta text primary key references public.effi_accounts (slug),
  guardado_en timestamptz not null default now(),
  prueba jsonb,
  ultima_sync timestamptz,
  ultimo_error text
);
alter table public.icomfly_conexion enable row level security;

create or replace function public.icomfly_guardar_token(p_sync text, p_cuenta text, p_token text, p_prueba jsonb default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v uuid; nombre text;
begin
  if not coalesce(public.effi_check_sync_token(p_sync), false) then raise exception 'Token de sincronización inválido'; end if;
  if p_cuenta not in ('AUNCLIC_HN', 'AUNCLIC_SV') then raise exception 'Tienda no permitida: %', p_cuenta; end if;
  if coalesce(p_token, '') !~ '^ik_live_[A-Za-z0-9_-]{10,}$' then raise exception 'El token debe empezar por ik_live_'; end if;
  nombre := 'icomfly_token_' || lower(p_cuenta);
  select id into v from vault.secrets where name = nombre;
  if v is null then perform vault.create_secret(p_token, nombre);
  else perform vault.update_secret(v, p_token, nombre); end if;
  insert into public.icomfly_conexion (cuenta, guardado_en, prueba) values (p_cuenta, now(), p_prueba)
  on conflict (cuenta) do update set guardado_en = now(), prueba = excluded.prueba, ultimo_error = null;
  return nombre;
end $$;
revoke all on function public.icomfly_guardar_token(text, text, text, jsonb) from public, authenticated;
grant execute on function public.icomfly_guardar_token(text, text, text, jsonb) to anon, service_role;

-- Para la sincronización (service_role): el token de una tienda.
create or replace function public.icomfly_token(p_cuenta text) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'icomfly_token_' || lower(p_cuenta);
$$;
revoke all on function public.icomfly_token(text) from public, anon, authenticated;
grant execute on function public.icomfly_token(text) to service_role;
