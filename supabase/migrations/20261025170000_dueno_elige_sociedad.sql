-- El dueño escoge qué Torre de control mira: todas las sociedades o una sola (Joalix AA Group, A un clic, Valka,
-- Distrilatam). La elección vive en su usuario (sociedad_vista) y la aplica app_cuentas_visibles, así todas las
-- pantallas y funciones muestran solo las cuentas de esa sociedad sin tocar cada una. Los socios y empleados no
-- cambian: siguen viendo solo su sociedad o sus tiendas.
alter table public.app_usuarios add column if not exists sociedad_vista text references public.app_sociedades (nombre) on update cascade;

create or replace function public.app_cuentas_visibles(p_modulo text default null)
returns text[] language sql stable security definer set search_path = '' as $$
  select case when public.app_es_owner() then array(
    select a.slug from public.effi_accounts a
    where (select u.sociedad_vista from public.app_usuarios u where u.user_id = (select auth.uid())) is null
       or a.sociedad = (select u.sociedad_vista from public.app_usuarios u where u.user_id = (select auth.uid())))
  else array(
    select a.slug from public.effi_accounts a join public.app_usuarios u on u.user_id = (select auth.uid())
    where u.activo and u.rol = 'socio' and a.sociedad = any (u.sociedades)
    union
    select p.cuenta from public.app_permisos p join public.app_usuarios u using (user_id)
    where p.user_id = (select auth.uid()) and u.activo and u.rol in ('empleado', 'proveedor')
      and (p_modulo is null or p_modulo = any (p.modulos)))
  end;
$$;

-- null = todas las sociedades.
create or replace function public.app_ver_sociedad(p_sociedad text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño escoge la sociedad'; end if;
  if p_sociedad is not null and not exists (select 1 from public.app_sociedades where nombre = p_sociedad) then
    raise exception 'Sociedad desconocida';
  end if;
  update public.app_usuarios set sociedad_vista = p_sociedad where user_id = auth.uid();
end $$;
revoke all on function public.app_ver_sociedad(text) from public, anon;
grant execute on function public.app_ver_sociedad(text) to authenticated;
