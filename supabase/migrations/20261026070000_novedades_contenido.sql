-- Bandeja de novedades: el contenido de la guía (lo que se vendió), para que la asesora sepa de qué producto habla.
create or replace function public.novedades_bandeja(p_cuentas text[] default null::text[])
returns jsonb language sql stable security definer set search_path to '' set "TimeZone" to 'UTC' as $function$
  with c as (
    select a.slug, a.tz_offset_min,
      (((now() + make_interval(mins => a.tz_offset_min))::date)::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz as inicio
    from public.effi_accounts a
    where a.tipo = 'tienda' and a.activa and a.slug = any (public.app_cuentas_visibles('novedades'))
      and (p_cuentas is null or a.slug = any (p_cuentas))
  ),
  env as (
    select distinct on (e.cuenta, e.empresa, e.novedad) e.*
    from public.novedad_envios e join c on c.slug = e.cuenta
    where e.creado_en >= now() - interval '10 days'
    order by e.cuenta, e.empresa, e.novedad, e.creado_en desc
  ),
  n as (
    select n.*, env.id as envio_id, env.estado as envio_estado, env.mensaje as envio_mensaje, env.nombre_solucion as envio_solucion,
      env.usuario_email as envio_usuario, env.creado_en as envio_en
    from public.effi_novedades n
    join c on c.slug = n.cuenta
    left join env on env.cuenta = n.cuenta and env.empresa = n.empresa and env.novedad = n.id
    where n.t_novedad = 2 and n.vigente is not false
      and (n.est_novedad = 1 or (env.id is not null and env.creado_en >= c.inicio))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cuenta', n.cuenta, 'empresa', n.empresa, 'id', n.id, 'guia', n.guia_novedad,
    'transportadora', n.nombre_transportadora_efficommerce, 'transportadora_id', n.transportadora_efficommerce,
    'novedad', n.nombre_novedad, 'aclaracion', n.aclaracion, 'llego', n.fecha_trans,
    'est_novedad', n.est_novedad, 'estado_novedad', n.estado_novedad, 'gestiones', n.cant_gestion,
    'cliente', g.nombre_destinatario, 'telefono', g.telefonos_destinatario, 'direccion', g.direccion_destinatario,
    'contenido', g.contenido,
    'ciudad', n.nombre_ciudad_destinatario, 'provincia', n.nombre_provincia_destinatario,
    'recaudo', n.valor_recaudo, 'estado_guia', coalesce(g.estado_efficommerce, n.estado),
    'llamadas', (select coalesce(jsonb_object_agg(l.intento, jsonb_build_object('r', l.resultado, 'u', l.usuario_email, 'en', l.creado_en)), '{}'::jsonb)
                 from public.novedad_llamadas l where l.cuenta = n.cuenta and l.empresa = n.empresa and l.novedad = n.id),
    'envio', case when n.envio_id is null then null else jsonb_build_object('id', n.envio_id, 'estado', n.envio_estado,
      'mensaje', n.envio_mensaje, 'solucion', n.envio_solucion, 'usuario', n.envio_usuario, 'en', n.envio_en) end
  ) order by n.fecha_trans desc), '[]'::jsonb)
  from n
  left join public.effi_guias g on g.cuenta = n.cuenta and g.empresa = n.empresa and g.sucursal = n.sucursal_guia and g.id = n.id_guia;
$function$;
