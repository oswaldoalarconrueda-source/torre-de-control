-- Informe diario por correo (Gmail). La cuenta y la contraseña de aplicación de Gmail viven cifradas en el Vault
-- (gmail_user, gmail_app_password); solo el servidor (service_role) puede guardarlas o leerlas.

-- Guarda o actualiza un secreto permitido en el Vault. Lo usa scripts/push-gmail.mjs con la service role.
create or replace function public.app_guardar_secreto(p_nombre text, p_valor text) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if p_nombre not in ('gmail_user', 'gmail_app_password') then raise exception 'Secreto no permitido: %', p_nombre; end if;
  if coalesce(btrim(p_valor), '') = '' then raise exception 'Valor vacío'; end if;
  select id into v from vault.secrets where name = p_nombre;
  if v is null then perform vault.create_secret(p_valor, p_nombre);
  else perform vault.update_secret(v, p_valor, p_nombre); end if;
end $$;
revoke all on function public.app_guardar_secreto(text, text) from public, anon, authenticated;
grant execute on function public.app_guardar_secreto(text, text) to service_role;

-- Credenciales de Gmail para la función informe-diario.
create or replace function public.informe_credenciales() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user', (select decrypted_secret from vault.decrypted_secrets where name = 'gmail_user'),
    'pass', (select decrypted_secret from vault.decrypted_secrets where name = 'gmail_app_password'));
$$;
revoke all on function public.informe_credenciales() from public, anon, authenticated;
grant execute on function public.informe_credenciales() to service_role;

-- Cifras del día por tienda (día local de cada país; p_dias_atras 0 = hoy hasta ahora, 1 = ayer), solo tiendas activas
-- con movimiento en 30 días. Más lo que está abierto ahora: en oficina, novedades por solucionar.
create or replace function public.informe_diario(p_dias_atras integer default 0, p_cuentas text[] default null) returns jsonb
language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with c as (
    select a.slug, a.sociedad, make_interval(mins => a.tz_offset_min) as off,
      ((((now() + make_interval(mins => a.tz_offset_min))::date - p_dias_atras))::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz as desde
    from public.effi_accounts a
    where a.tipo = 'tienda' and a.activa and (p_cuentas is null or a.slug = any (p_cuentas))
      and exists (select 1 from public.effi_guias g where g.cuenta = a.slug and g.fecha_trans > now() - interval '30 days')
  ),
  d as (select c.*, least(now(), c.desde + interval '1 day') as hasta, (c.desde + c.off)::date as dia from c)
  select coalesce(jsonb_agg(jsonb_build_object(
    'cuenta', d.slug, 'sociedad', d.sociedad, 'dia', d.dia,
    'ordenes', (select count(*) from public.auto_ordenes o where o.cuenta = d.slug and o.fecha_orden >= d.desde and o.fecha_orden < d.hasta),
    'remisiones', (select count(*) from public.auto_ordenes o where o.cuenta = d.slug and o.rem_fecha >= d.desde and o.rem_fecha < d.hasta and o.rem_vigente is not false),
    'guias', (select count(*) from public.effi_guias g where g.cuenta = d.slug and g.fecha_trans >= d.desde and g.fecha_trans < d.hasta and g.vigente is not false),
    'entregadas', (select count(distinct e.id_guia) from public.effi_guia_estados e where e.cuenta = d.slug and e.est_guia_new_efficommerce = 4 and e.fecha_hist_est >= d.desde and e.fecha_hist_est < d.hasta),
    'devoluciones', (select count(distinct e.id_guia) from public.effi_guia_estados e where e.cuenta = d.slug and e.est_guia_new_efficommerce = 5 and e.fecha_hist_est >= d.desde and e.fecha_hist_est < d.hasta),
    'novedades', (select count(distinct e.id_guia) from public.effi_guia_estados e where e.cuenta = d.slug and e.est_guia_new_efficommerce = 3 and e.fecha_hist_est >= d.desde and e.fecha_hist_est < d.hasta),
    'llegaron_oficina', (select count(distinct e.id_guia) from public.effi_guia_estados e where e.cuenta = d.slug and e.est_guia_new_efficommerce = 9 and e.fecha_hist_est >= d.desde and e.fecha_hist_est < d.hasta),
    'recaudo', coalesce((select sum(w.valor) from public.effi_wallet w where w.cuenta = d.slug and w.t_movimiento = 1 and w.vigente is not false and w.fecha_trans >= d.desde and w.fecha_trans < d.hasta), 0),
    'pagos', (select count(*) from public.effi_wallet w where w.cuenta = d.slug and w.t_movimiento = 1 and w.vigente is not false and w.fecha_trans >= d.desde and w.fecha_trans < d.hasta),
    'errores_agente', (select count(distinct x.id_orden) from public.auto_eventos x where x.cuenta = d.slug and x.ok is false and x.creado_en >= d.desde and x.creado_en < d.hasta
                        and not exists (select 1 from public.auto_ordenes o where o.cuenta = x.cuenta and o.id = x.id_orden and o.guia is not null)),
    'en_oficina_ahora', (select count(*) from public.effi_guias g where g.cuenta = d.slug and g.est_guia_efficommerce = 9 and g.vigente is not false),
    'novedades_abiertas', (select count(*) from public.effi_novedades n where n.cuenta = d.slug and n.t_novedad = 2 and n.est_novedad = 1 and n.vigente is not false)
  ) order by d.slug), '[]'::jsonb)
  from d;
$$;
revoke all on function public.informe_diario(integer, text[]) from public, anon, authenticated;
grant execute on function public.informe_diario(integer, text[]) to service_role;
