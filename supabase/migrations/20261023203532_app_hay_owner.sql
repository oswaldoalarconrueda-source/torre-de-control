-- La pantalla de login solo ofrece "crear cuenta de dueño" mientras no exista ninguno.
create function public.app_hay_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_usuarios where rol = 'owner');
$$;
grant execute on function public.app_hay_owner() to anon, authenticated;

-- Última sincronización (para el indicador "en vivo"); visible para cualquier usuario autenticado.
create function public.app_ultimo_sync() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(ultimo_ok) from public.effi_sync_state;
$$;
revoke all on function public.app_ultimo_sync() from public, anon;
grant execute on function public.app_ultimo_sync() to authenticated;
