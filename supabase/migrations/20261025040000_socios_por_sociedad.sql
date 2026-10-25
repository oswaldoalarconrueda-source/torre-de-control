-- 👥 Socios por sociedad: el dueño tiene 3 sociedades (de 4, 2 y 1 tiendas) y una proveeduría propia en varios
-- países. Un socio se amarra a su(s) sociedad(es), no a tiendas sueltas: cuando se conecte una tienda nueva de su
-- sociedad (effi_accounts.sociedad), la ve sola. Empleados y proveeduría siguen por cuenta + módulos.

alter table public.app_usuarios add column sociedades text[] not null default array[]::text[];

create or replace function public.app_puede_ver(p_cuenta text, p_modulo text default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.app_es_owner()
    or exists (
      select 1 from public.app_usuarios u join public.effi_accounts a on a.slug = p_cuenta
      where u.user_id = (select auth.uid()) and u.activo and u.rol = 'socio' and a.sociedad = any (u.sociedades))
    or exists (
      select 1 from public.app_permisos p join public.app_usuarios u using (user_id)
      where p.user_id = (select auth.uid()) and p.cuenta = p_cuenta and u.activo
        and u.rol in ('empleado', 'proveedor') and (p_modulo is null or p_modulo = any (p.modulos)));
$$;

create or replace function public.app_cuentas_visibles(p_modulo text default null) returns text[]
language sql stable security definer set search_path = '' as $$
  select case when public.app_es_owner() then array(select slug from public.effi_accounts)
  else array(
    select a.slug from public.effi_accounts a join public.app_usuarios u on u.user_id = (select auth.uid())
    where u.activo and u.rol = 'socio' and a.sociedad = any (u.sociedades)
    union
    select p.cuenta from public.app_permisos p join public.app_usuarios u using (user_id)
    where p.user_id = (select auth.uid()) and u.activo and u.rol in ('empleado', 'proveedor')
      and (p_modulo is null or p_modulo = any (p.modulos)))
  end;
$$;

-- Aprobar o editar: socio → sociedades; empleado y proveeduría → cuentas + módulos.
drop function public.app_admin_guardar(uuid, text, text[], text[]);
create function public.app_admin_guardar(p_user_id uuid, p_rol text, p_sociedades text[], p_cuentas text[], p_modulos text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño administra usuarios'; end if;
  if p_rol not in ('socio', 'empleado', 'proveedor') then raise exception 'Rol no válido'; end if;
  if p_user_id = auth.uid() then raise exception 'No puedes cambiar tu propio rol de dueño'; end if;
  if p_rol = 'socio' and coalesce(array_length(p_sociedades, 1), 0) = 0 then raise exception 'Elige al menos una sociedad'; end if;
  if p_rol <> 'socio' and coalesce(array_length(p_cuentas, 1), 0) = 0 then raise exception 'Elige al menos una tienda o cuenta'; end if;
  if p_rol <> 'socio' and coalesce(array_length(p_modulos, 1), 0) = 0 then raise exception 'Elige al menos un módulo'; end if;
  update public.app_usuarios
  set rol = p_rol, activo = true,
      sociedades = case when p_rol = 'socio' then p_sociedades else array[]::text[] end,
      aprobado_por = coalesce(aprobado_por, (select email from auth.users where id = auth.uid())),
      aprobado_en = coalesce(aprobado_en, now())
  where user_id = p_user_id;
  delete from public.app_permisos where user_id = p_user_id;
  if p_rol <> 'socio' then
    insert into public.app_permisos (user_id, cuenta, modulos)
    select p_user_id, c, p_modulos from unnest(p_cuentas) c where c in (select slug from public.effi_accounts);
  end if;
end $$;
revoke all on function public.app_admin_guardar(uuid, text, text[], text[], text[]) from public, anon;
grant execute on function public.app_admin_guardar(uuid, text, text[], text[], text[]) to authenticated;

-- La lista de administración incluye las sociedades de cada usuario.
create or replace function public.app_admin_lista() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.app_es_owner() then null else jsonb_build_object(
    'usuarios', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', u.user_id, 'email', u.email, 'nombre', u.nombre, 'cedula', u.cedula, 'rol', u.rol, 'activo', u.activo,
        'sociedades', u.sociedades, 'creado_en', u.creado_en, 'aprobado_por', u.aprobado_por, 'aprobado_en', u.aprobado_en,
        'ultimo_ingreso', (select last_sign_in_at from auth.users a where a.id = u.user_id),
        'permisos', coalesce((select jsonb_agg(jsonb_build_object('cuenta', p.cuenta, 'modulos', p.modulos) order by p.cuenta)
                              from public.app_permisos p where p.user_id = u.user_id), '[]'::jsonb)
      ) order by (u.rol = 'pendiente') desc, u.creado_en desc) from public.app_usuarios u), '[]'::jsonb),
    'cuentas', coalesce((select jsonb_agg(jsonb_build_object('slug', slug, 'nombre', nombre, 'tipo', tipo, 'pais', pais, 'sociedad', sociedad)
                         order by sociedad, tipo, slug) from public.effi_accounts where activa), '[]'::jsonb)
  ) end;
$$;
