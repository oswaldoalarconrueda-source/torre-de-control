-- Bandeja de novedades: "Hacer seguimiento", interno (no va a Effi ni a la transportadora). La asesora pone el día en que
-- el cliente pidió que lo llamen ("llámeme el martes") y una nota; ese día la novedad sube arriba de la bandeja, mientras
-- siga abierta en Effi (si se entrega, se devuelve o se soluciona, sale sola). Una por novedad; quitarla = fecha vacía.
create table public.novedad_seguimientos (
  cuenta text not null references public.effi_accounts (slug),
  empresa bigint not null,
  novedad bigint not null,
  fecha date not null,
  nota text check (char_length(nota) <= 500),
  usuario uuid,
  usuario_email text,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, empresa, novedad)
);
alter table public.novedad_seguimientos enable row level security;
create policy novedad_seguimientos_leer on public.novedad_seguimientos for select to authenticated
  using (cuenta = any ((select public.app_cuentas_visibles('novedades'))::text[]));

create function public.novedad_seguir(p_cuenta text, p_empresa bigint, p_novedad bigint, p_fecha date, p_nota text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not p_cuenta = any (public.app_cuentas_visibles('novedades')) then raise exception 'Sin permiso para esta tienda'; end if;
  if p_fecha is null then
    delete from public.novedad_seguimientos where cuenta = p_cuenta and empresa = p_empresa and novedad = p_novedad;
    return;
  end if;
  insert into public.novedad_seguimientos (cuenta, empresa, novedad, fecha, nota, usuario, usuario_email)
  values (p_cuenta, p_empresa, p_novedad, p_fecha, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(),
          (select email from auth.users where id = auth.uid()))
  on conflict (cuenta, empresa, novedad) do update
    set fecha = excluded.fecha, nota = excluded.nota, usuario = excluded.usuario, usuario_email = excluded.usuario_email, actualizado_en = now();
end $$;
revoke all on function public.novedad_seguir(text, bigint, bigint, date, text) from public, anon;
grant execute on function public.novedad_seguir(text, bigint, bigint, date, text) to authenticated;

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
    'seguimiento', (select jsonb_build_object('fecha', s.fecha, 'nota', s.nota, 'u', s.usuario_email, 'en', s.actualizado_en)
                    from public.novedad_seguimientos s where s.cuenta = n.cuenta and s.empresa = n.empresa and s.novedad = n.id),
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
