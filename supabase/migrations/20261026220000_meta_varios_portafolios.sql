-- Meta: un token por portafolio comercial (cada portafolio con su propia app y su usuario del sistema; las cuentas
-- publicitarias no se comparten entre portafolios). En el Vault: meta_access_token (Compras FACIL) y
-- meta_access_token_<nombre> para los demás. meta-gasto recorre todos.
create or replace function public.app_guardar_secreto(p_nombre text, p_valor text) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if p_nombre not in ('gmail_user', 'gmail_app_password') and p_nombre !~ '^meta_access_token(_[a-z0-9]+)?$' then
    raise exception 'Secreto no permitido: %', p_nombre;
  end if;
  if coalesce(btrim(p_valor), '') = '' then raise exception 'Valor vacío'; end if;
  select id into v from vault.secrets where name = p_nombre;
  if v is null then perform vault.create_secret(p_valor, p_nombre);
  else perform vault.update_secret(v, p_valor, p_nombre); end if;
end $$;
revoke all on function public.app_guardar_secreto(text, text) from public, anon, authenticated;
grant execute on function public.app_guardar_secreto(text, text) to service_role;

drop function if exists public.meta_credenciales();
create or replace function public.meta_tokens() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('nombre', name, 'token', decrypted_secret) order by name), '[]'::jsonb)
  from vault.decrypted_secrets where name ~ '^meta_access_token(_[a-z0-9]+)?$';
$$;
revoke all on function public.meta_tokens() from public, anon, authenticated;
grant execute on function public.meta_tokens() to service_role;

-- De qué token (portafolio) sale cada cuenta publicitaria.
alter table public.meta_cuentas_ads add column if not exists token text;
