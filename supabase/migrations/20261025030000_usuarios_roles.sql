-- 👥 Usuarios y roles de la Torre.
--
-- Registro: cualquiera abre el link /registro y deja nombre, cédula, correo y clave. La función de borde `registro`
-- crea la cuenta ya confirmada (sin correo de confirmación: el SMTP de Supabase no le llega a gente externa) y queda
-- con rol 'pendiente', sin acceso a nada. El dueño la aprueba desde /usuarios eligiendo:
--   socio      → entra a las tiendas de su(s) sociedad(es) y ve todos los módulos de ellas.
--   empleado   → entra a las tiendas que se le asignen y solo a los módulos que se le marquen.
--   proveedor  → igual que empleado, para cuentas de proveeduría.
-- También puede rechazar una solicitud o desactivar a alguien (deja de ver todo sin borrar su historial).

alter table public.app_usuarios drop constraint app_usuarios_rol_check;
alter table public.app_usuarios add constraint app_usuarios_rol_check
  check (rol in ('owner', 'socio', 'empleado', 'proveedor', 'pendiente', 'rechazado'));
alter table public.app_usuarios
  add column cedula text,
  add column activo boolean not null default true,
  add column aprobado_por text,
  add column aprobado_en timestamptz;
alter table public.app_permisos alter column modulos set default array[]::text[];

-- Cada tienda pertenece a una sociedad (para dar acceso a un socio a toda su sociedad de una vez).
alter table public.effi_accounts add column sociedad text not null default 'Joalix Group SAS';

-- Usuarios nuevos: el primero es el dueño; los demás quedan pendientes con su nombre y cédula del registro.
create or replace function public.app_nuevo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.app_usuarios (user_id, email, nombre, cedula, rol)
  values (new.id, new.email, new.raw_user_meta_data->>'nombre', new.raw_user_meta_data->>'cedula',
    case when exists (select 1 from public.app_usuarios where rol = 'owner') then 'pendiente' else 'owner' end);
  return new;
end $$;

-- Permisos: solo cuentan los usuarios activos y aprobados (socio, empleado, proveedor).
create or replace function public.app_puede_ver(p_cuenta text, p_modulo text default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.app_es_owner() or exists (
    select 1 from public.app_permisos p join public.app_usuarios u using (user_id)
    where p.user_id = (select auth.uid()) and p.cuenta = p_cuenta and u.activo
      and u.rol in ('socio', 'empleado', 'proveedor')
      and (u.rol = 'socio' or p_modulo is null or p_modulo = any (p.modulos)));
$$;
create or replace function public.app_cuentas_visibles(p_modulo text default null) returns text[]
language sql stable security definer set search_path = '' as $$
  select case when public.app_es_owner() then array(select slug from public.effi_accounts)
  else array(
    select p.cuenta from public.app_permisos p join public.app_usuarios u using (user_id)
    where p.user_id = (select auth.uid()) and u.activo and u.rol in ('socio', 'empleado', 'proveedor')
      and (u.rol = 'socio' or p_modulo is null or p_modulo = any (p.modulos)))
  end;
$$;

-- Lo que la pantalla de administración necesita: solicitudes, usuarios con sus permisos y las cuentas por sociedad.
create function public.app_admin_lista() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.app_es_owner() then null else jsonb_build_object(
    'usuarios', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', u.user_id, 'email', u.email, 'nombre', u.nombre, 'cedula', u.cedula, 'rol', u.rol, 'activo', u.activo,
        'creado_en', u.creado_en, 'aprobado_por', u.aprobado_por, 'aprobado_en', u.aprobado_en,
        'ultimo_ingreso', (select last_sign_in_at from auth.users a where a.id = u.user_id),
        'permisos', coalesce((select jsonb_agg(jsonb_build_object('cuenta', p.cuenta, 'modulos', p.modulos) order by p.cuenta)
                              from public.app_permisos p where p.user_id = u.user_id), '[]'::jsonb)
      ) order by (u.rol = 'pendiente') desc, u.creado_en desc) from public.app_usuarios u), '[]'::jsonb),
    'cuentas', coalesce((select jsonb_agg(jsonb_build_object('slug', slug, 'nombre', nombre, 'tipo', tipo, 'pais', pais, 'sociedad', sociedad)
                         order by sociedad, tipo, slug) from public.effi_accounts where activa), '[]'::jsonb)
  ) end;
$$;

-- Aprobar o editar: rol + cuentas + módulos (los socios ven todos los módulos de sus cuentas).
create function public.app_admin_guardar(p_user_id uuid, p_rol text, p_cuentas text[], p_modulos text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño administra usuarios'; end if;
  if p_rol not in ('socio', 'empleado', 'proveedor') then raise exception 'Rol no válido'; end if;
  if p_user_id = auth.uid() then raise exception 'No puedes cambiar tu propio rol de dueño'; end if;
  if coalesce(array_length(p_cuentas, 1), 0) = 0 then raise exception 'Elige al menos una tienda o cuenta'; end if;
  if p_rol <> 'socio' and coalesce(array_length(p_modulos, 1), 0) = 0 then raise exception 'Elige al menos un módulo'; end if;
  update public.app_usuarios
  set rol = p_rol, activo = true,
      aprobado_por = coalesce(aprobado_por, (select email from auth.users where id = auth.uid())),
      aprobado_en = coalesce(aprobado_en, now())
  where user_id = p_user_id;
  delete from public.app_permisos where user_id = p_user_id;
  insert into public.app_permisos (user_id, cuenta, modulos)
  select p_user_id, c, case when p_rol = 'socio' then array[]::text[] else p_modulos end
  from unnest(p_cuentas) c where c in (select slug from public.effi_accounts);
end $$;

create function public.app_admin_rechazar(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño administra usuarios'; end if;
  if p_user_id = auth.uid() then raise exception 'No puedes rechazarte a ti mismo'; end if;
  update public.app_usuarios set rol = 'rechazado' where user_id = p_user_id;
  delete from public.app_permisos where user_id = p_user_id;
end $$;

create function public.app_admin_activo(p_user_id uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño administra usuarios'; end if;
  if p_user_id = auth.uid() then raise exception 'No puedes desactivarte a ti mismo'; end if;
  update public.app_usuarios set activo = p_activo where user_id = p_user_id;
end $$;

revoke all on function public.app_admin_lista() from public, anon;
revoke all on function public.app_admin_guardar(uuid, text, text[], text[]) from public, anon;
revoke all on function public.app_admin_rechazar(uuid) from public, anon;
revoke all on function public.app_admin_activo(uuid, boolean) from public, anon;
grant execute on function public.app_admin_lista() to authenticated;
grant execute on function public.app_admin_guardar(uuid, text, text[], text[]) to authenticated;
grant execute on function public.app_admin_rechazar(uuid) to authenticated;
grant execute on function public.app_admin_activo(uuid, boolean) to authenticated;
