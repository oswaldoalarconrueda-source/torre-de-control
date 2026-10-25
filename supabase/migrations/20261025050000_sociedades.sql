-- 🏢 Sociedades del dueño: 3 de tiendas (Joalix AA Group con las 4 NaturalFitt, A un clic y Valka) y la proveeduría
-- Distrilatam en varios países. Se guardan aparte para poder aprobar socios de una sociedad aunque sus tiendas
-- todavía no estén conectadas; cuando se conecten, basta con poner effi_accounts.sociedad.

create table public.app_sociedades (
  nombre text primary key,
  tipo text not null check (tipo in ('tiendas', 'proveeduria')),
  orden int not null default 0
);
alter table public.app_sociedades enable row level security;
create policy "sociedades_lectura" on public.app_sociedades for select to authenticated using (true);

insert into public.app_sociedades (nombre, tipo, orden) values
  ('Joalix AA Group', 'tiendas', 1),
  ('A un clic', 'tiendas', 2),
  ('Valka', 'tiendas', 3),
  ('Distrilatam', 'proveeduria', 4);

update public.effi_accounts set sociedad = 'Joalix AA Group' where sociedad = 'Joalix Group SAS';
update public.app_usuarios set sociedades = array_replace(sociedades, 'Joalix Group SAS', 'Joalix AA Group');

alter table public.effi_accounts alter column sociedad drop default;
alter table public.effi_accounts
  add constraint effi_accounts_sociedad_fk foreign key (sociedad) references public.app_sociedades (nombre) on update cascade;

-- La lista de administración trae también las sociedades (con o sin tiendas conectadas).
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
                         order by sociedad, tipo, slug) from public.effi_accounts where activa), '[]'::jsonb),
    'sociedades', coalesce((select jsonb_agg(jsonb_build_object('nombre', nombre, 'tipo', tipo) order by orden)
                            from public.app_sociedades), '[]'::jsonb)
  ) end;
$$;

-- Un socio solo puede quedar en sociedades que existan.
create or replace function public.app_admin_guardar(p_user_id uuid, p_rol text, p_sociedades text[], p_cuentas text[], p_modulos text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño administra usuarios'; end if;
  if p_rol not in ('socio', 'empleado', 'proveedor') then raise exception 'Rol no válido'; end if;
  if p_user_id = auth.uid() then raise exception 'No puedes cambiar tu propio rol de dueño'; end if;
  if p_rol = 'socio' and coalesce(array_length(p_sociedades, 1), 0) = 0 then raise exception 'Elige al menos una sociedad'; end if;
  if p_rol = 'socio' and exists (select 1 from unnest(p_sociedades) s where s not in (select nombre from public.app_sociedades)) then
    raise exception 'Sociedad no válida';
  end if;
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
