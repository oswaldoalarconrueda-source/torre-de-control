-- 📞 Bandeja de novedades: las asesoras solucionan desde la Torre, línea por línea, sin entrar a Effi.
-- - novedad_soluciones: catálogo de soluciones de cada transportadora (la API de Effi no lo trae; se aprende del
--   historial de soluciones con la función novedades?accion=catalogo).
-- - novedad_llamadas: Contacto 1, 2 y 3 de cada novedad (el mismo CRM de Disponible en oficina), a nombre de quien llama.
-- - novedad_envios: cada solución enviada a Effi (POST api/gestion_novedad_guia_transporte) con lo que respondió.
--   Un envío "enviando" a la vez por novedad: un doble clic no crea dos soluciones en Effi.

create table public.novedad_soluciones (
  cuenta text not null references public.effi_accounts (slug),
  transportadora_efficommerce integer not null,
  id_solucion integer not null,
  nombre_solucion text not null,
  pide_entrega boolean not null default false,   -- volver a ofrecer / redireccionar: fecha, quién recibe, dirección, teléfono
  veces integer not null default 0,
  visto_en timestamptz not null default now(),
  primary key (cuenta, transportadora_efficommerce, id_solucion)
);
alter table public.novedad_soluciones enable row level security;
create policy novedad_soluciones_leer on public.novedad_soluciones for select to authenticated
  using (cuenta = any ((select public.app_cuentas_visibles('novedades'))::text[]));

create table public.novedad_llamadas (
  id bigint generated always as identity primary key,
  cuenta text not null references public.effi_accounts (slug),
  empresa bigint not null,
  novedad bigint not null,
  intento integer not null check (intento between 1 and 3),
  resultado text not null check (resultado in ('contesto', 'no_contesto', 'telefono_malo')),
  usuario uuid,
  usuario_email text,
  creado_en timestamptz not null default now(),
  unique (cuenta, empresa, novedad, intento)
);
create index novedad_llamadas_fecha on public.novedad_llamadas (cuenta, creado_en);
alter table public.novedad_llamadas enable row level security;
create policy novedad_llamadas_leer on public.novedad_llamadas for select to authenticated
  using (cuenta = any ((select public.app_cuentas_visibles('novedades'))::text[]));

create table public.novedad_envios (
  id bigint generated always as identity primary key,
  cuenta text not null references public.effi_accounts (slug),
  empresa bigint not null,
  novedad bigint not null,
  id_solucion integer not null,
  nombre_solucion text,
  gestion text not null check (char_length(gestion) between 1 and 1024),
  fecha_nueva_entrega date,
  destinatario text,
  direccion text,
  telefonos text,
  estado text not null default 'enviando' check (estado in ('enviando', 'enviada', 'error')),
  mensaje text,
  respuesta jsonb,
  usuario uuid,
  usuario_email text,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz
);
create unique index novedad_envios_uno_a_la_vez on public.novedad_envios (cuenta, empresa, novedad) where estado = 'enviando';
create index novedad_envios_fecha on public.novedad_envios (cuenta, enviado_en);
create index novedad_envios_novedad on public.novedad_envios (cuenta, empresa, novedad);
alter table public.novedad_envios enable row level security;
create policy novedad_envios_leer on public.novedad_envios for select to authenticated
  using (cuenta = any ((select public.app_cuentas_visibles('novedades'))::text[]));

-- Marca (o borra, con resultado vacío) el contacto 1, 2 o 3 de una novedad. Queda a nombre de quien lo marca.
create function public.novedad_llamar(p_cuenta text, p_empresa bigint, p_novedad bigint, p_intento integer, p_resultado text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not p_cuenta = any (public.app_cuentas_visibles('novedades')) then raise exception 'Sin permiso para esta tienda'; end if;
  if coalesce(p_resultado, '') = '' then
    delete from public.novedad_llamadas
    where cuenta = p_cuenta and empresa = p_empresa and novedad = p_novedad and intento = p_intento;
    return;
  end if;
  insert into public.novedad_llamadas (cuenta, empresa, novedad, intento, resultado, usuario, usuario_email)
  values (p_cuenta, p_empresa, p_novedad, p_intento, p_resultado, auth.uid(), (select email from auth.users where id = auth.uid()))
  on conflict (cuenta, empresa, novedad, intento) do update
    set resultado = excluded.resultado, usuario = excluded.usuario, usuario_email = excluded.usuario_email, creado_en = now();
end $$;

-- Envía la solución a Effi: valida como Effi (fecha de 1 a 5 días, largos), deja el envío "enviando" y le pide a la
-- función novedades que lo mande. Devuelve el id del envío para seguir su estado.
create function public.novedad_enviar(p_cuenta text, p_empresa bigint, p_novedad bigint, p_id_solucion integer, p_gestion text,
  p_fecha date default null, p_destinatario text default null, p_direccion text default null, p_telefonos text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare n record; s record; hoy date; v_id bigint;
begin
  if not p_cuenta = any (public.app_cuentas_visibles('novedades')) then raise exception 'Sin permiso para esta tienda'; end if;
  select * into n from public.effi_novedades where cuenta = p_cuenta and empresa = p_empresa and id = p_novedad;
  if n is null then raise exception 'La novedad no existe'; end if;
  if n.t_novedad <> 2 then raise exception 'Esta novedad la resuelve la transportadora'; end if;
  if n.est_novedad <> 1 then raise exception 'La novedad ya no está pendiente (%)', coalesce(n.estado_novedad, 'cambió en Effi'); end if;
  select * into s from public.novedad_soluciones
  where cuenta = p_cuenta and transportadora_efficommerce = n.transportadora_efficommerce and id_solucion = p_id_solucion;
  if s is null then raise exception 'Esa solución no es de % ', coalesce(n.nombre_transportadora_efficommerce, 'esta transportadora'); end if;
  p_gestion := btrim(coalesce(p_gestion, ''));
  if p_gestion = '' then raise exception 'Escribe qué se habló con el cliente'; end if;
  if char_length(p_gestion) > 1024 then raise exception 'Lo que se habló no puede pasar de 1.024 letras'; end if;
  if s.pide_entrega then
    select ((now() + make_interval(mins => tz_offset_min))::date) into hoy from public.effi_accounts where slug = p_cuenta;
    if p_fecha is null or p_fecha < hoy + 1 or p_fecha > hoy + 5 then raise exception 'La nueva entrega debe ser de 1 a 5 días después de hoy'; end if;
    if btrim(coalesce(p_destinatario, '')) = '' or char_length(p_destinatario) > 50 then raise exception 'Quién recibe: obligatorio, máximo 50 letras'; end if;
    if btrim(coalesce(p_direccion, '')) = '' or char_length(p_direccion) > 100 then raise exception 'Dirección: obligatoria, máximo 100 letras'; end if;
    if char_length(btrim(coalesce(p_telefonos, ''))) not between 7 and 40 then raise exception 'Teléfono: de 7 a 40 caracteres'; end if;
  else
    p_fecha := null; p_destinatario := null; p_direccion := null; p_telefonos := null;
  end if;
  begin
    insert into public.novedad_envios (cuenta, empresa, novedad, id_solucion, nombre_solucion, gestion, fecha_nueva_entrega,
      destinatario, direccion, telefonos, usuario, usuario_email)
    values (p_cuenta, p_empresa, p_novedad, p_id_solucion, s.nombre_solucion, p_gestion, p_fecha,
      btrim(p_destinatario), btrim(p_direccion), btrim(p_telefonos), auth.uid(), (select email from auth.users where id = auth.uid()))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Esta novedad ya se está enviando a Effi';
  end;
  perform net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/novedades?accion=enviar&id=' || v_id,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 30000);
  return v_id;
end $$;

-- La bandeja: novedades que requieren solución de la tienda y siguen pendientes, más las que se enviaron hoy (para
-- verlas en verde). Con los datos del cliente de la guía, los 3 contactos y el último envío.
create function public.novedades_bandeja(p_cuentas text[] default null)
returns jsonb language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
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
    'ciudad', n.nombre_ciudad_destinatario, 'provincia', n.nombre_provincia_destinatario,
    'recaudo', n.valor_recaudo, 'estado_guia', coalesce(g.estado_efficommerce, n.estado),
    'llamadas', (select coalesce(jsonb_object_agg(l.intento, jsonb_build_object('r', l.resultado, 'u', l.usuario_email, 'en', l.creado_en)), '{}'::jsonb)
                 from public.novedad_llamadas l where l.cuenta = n.cuenta and l.empresa = n.empresa and l.novedad = n.id),
    'envio', case when n.envio_id is null then null else jsonb_build_object('id', n.envio_id, 'estado', n.envio_estado,
      'mensaje', n.envio_mensaje, 'solucion', n.envio_solucion, 'usuario', n.envio_usuario, 'en', n.envio_en) end
  ) order by n.fecha_trans desc), '[]'::jsonb)
  from n
  left join public.effi_guias g on g.cuenta = n.cuenta and g.empresa = n.empresa and g.sucursal = n.sucursal_guia and g.id = n.id_guia;
$$;

-- Medidores del periodo (cada día en la hora local de cada país): llegaron, llamadas, contactados, solucionadas,
-- cuántas guías solucionadas cambiaron de estado y cuántas terminaron entregadas, pendientes de hoy y tiempo de
-- respuesta. Lo mismo por asesora; sus pendientes = novedades que llamó y siguen sin solución.
create function public.novedades_medidores(p_cuentas text[] default null, p_desde date default null, p_hasta date default null)
returns jsonb language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with c as (
    select a.slug,
      ((coalesce(p_desde, (now() + make_interval(mins => a.tz_offset_min))::date))::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz as desde,
      ((coalesce(p_hasta, p_desde, (now() + make_interval(mins => a.tz_offset_min))::date) + 1)::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz as hasta
    from public.effi_accounts a
    where a.tipo = 'tienda' and a.activa and a.slug = any (public.app_cuentas_visibles('novedades'))
      and (p_cuentas is null or a.slug = any (p_cuentas))
  ),
  lle as (select n.cuenta, count(*) n from public.effi_novedades n join c on c.slug = n.cuenta
          where n.t_novedad = 2 and n.vigente is not false and n.fecha_trans >= c.desde and n.fecha_trans < c.hasta group by 1),
  pen as (select n.cuenta, count(*) n from public.effi_novedades n join c on c.slug = n.cuenta
          where n.t_novedad = 2 and n.vigente is not false and n.est_novedad = 1 group by 1),
  ll as (select l.* from public.novedad_llamadas l join c on c.slug = l.cuenta where l.creado_en >= c.desde and l.creado_en < c.hasta),
  sol as (
    select e.cuenta, e.usuario_email, e.enviado_en, n.fecha_trans as llego,
      g.ultimo_cambio_estado > e.enviado_en as cambio, g.est_guia_efficommerce = 4 as entregada
    from public.novedad_envios e
    join c on c.slug = e.cuenta
    join public.effi_novedades n on n.cuenta = e.cuenta and n.empresa = e.empresa and n.id = e.novedad
    left join public.effi_guias g on g.cuenta = n.cuenta and g.empresa = n.empresa and g.sucursal = n.sucursal_guia and g.id = n.id_guia
    where e.estado = 'enviada' and e.enviado_en >= c.desde and e.enviado_en < c.hasta
  ),
  -- Pendientes de cada asesora: novedades que llamó, siguen pendientes en Effi y no tienen solución enviada.
  pa as (
    select l.usuario_email, count(distinct (l.cuenta, l.empresa, l.novedad)) n
    from public.novedad_llamadas l
    join c on c.slug = l.cuenta
    join public.effi_novedades n on n.cuenta = l.cuenta and n.empresa = l.empresa and n.id = l.novedad and n.est_novedad = 1 and n.vigente is not false
    where not exists (select 1 from public.novedad_envios e where e.cuenta = l.cuenta and e.empresa = l.empresa and e.novedad = l.novedad and e.estado <> 'error')
    group by 1
  ),
  quienes as (select usuario_email from ll union select usuario_email from sol union select usuario_email from pa)
  select jsonb_build_object(
    'cuentas', (select coalesce(jsonb_agg(jsonb_build_object(
      'cuenta', c.slug,
      'llegaron', coalesce((select n from lle where lle.cuenta = c.slug), 0),
      'llamadas', (select count(*) from ll where ll.cuenta = c.slug),
      'contactados', (select count(*) from ll where ll.cuenta = c.slug and ll.resultado = 'contesto'),
      'solucionadas', (select count(*) from sol where sol.cuenta = c.slug),
      'cambiaron', (select count(*) from sol where sol.cuenta = c.slug and sol.cambio),
      'entregadas', (select count(*) from sol where sol.cuenta = c.slug and sol.entregada),
      'pendientes', coalesce((select n from pen where pen.cuenta = c.slug), 0),
      'respuesta_min', (select round(avg(extract(epoch from sol.enviado_en - sol.llego) / 60)) from sol where sol.cuenta = c.slug)
    ) order by c.slug), '[]'::jsonb) from c),
    'asesoras', (select coalesce(jsonb_agg(jsonb_build_object(
      'email', q.usuario_email,
      'nombre', coalesce((select u.nombre from public.app_usuarios u where u.email = q.usuario_email), split_part(q.usuario_email, '@', 1)),
      'llamadas', (select count(*) from ll where ll.usuario_email = q.usuario_email),
      'contactados', (select count(*) from ll where ll.usuario_email = q.usuario_email and ll.resultado = 'contesto'),
      'solucionadas', (select count(*) from sol where sol.usuario_email = q.usuario_email),
      'cambiaron', (select count(*) from sol where sol.usuario_email = q.usuario_email and sol.cambio),
      'entregadas', (select count(*) from sol where sol.usuario_email = q.usuario_email and sol.entregada),
      'pendientes', coalesce((select n from pa where pa.usuario_email = q.usuario_email), 0),
      'respuesta_min', (select round(avg(extract(epoch from sol.enviado_en - sol.llego) / 60)) from sol where sol.usuario_email = q.usuario_email)
    ) order by q.usuario_email), '[]'::jsonb) from quienes q where q.usuario_email is not null)
  );
$$;

revoke all on function public.novedad_llamar(text, bigint, bigint, integer, text) from public, anon;
revoke all on function public.novedad_enviar(text, bigint, bigint, integer, text, date, text, text, text) from public, anon;
revoke all on function public.novedades_bandeja(text[]) from public, anon;
revoke all on function public.novedades_medidores(text[], date, date) from public, anon;
grant execute on function public.novedad_llamar(text, bigint, bigint, integer, text) to authenticated;
grant execute on function public.novedad_enviar(text, bigint, bigint, integer, text, date, text, text, text) to authenticated;
grant execute on function public.novedades_bandeja(text[]) to authenticated;
grant execute on function public.novedades_medidores(text[], date, date) to authenticated;

-- El estado de las novedades abiertas se refresca cada 10 minutos (antes cada hora); las nuevas ya llegan cada minuto
-- con la sincronización incremental. El catálogo de soluciones se aprende cada madrugada.
select cron.alter_job((select jobid from cron.job where jobname = 'effi-novedades-hora'), schedule := '*/10 * * * *',
  command := $c$ select public.effi_sync_encolar('novedades_2', now() - interval '10 days'); $c$);
select cron.schedule('novedades-catalogo', '15 10 * * *', $c$
  select net.http_post(url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/novedades?accion=catalogo',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 10000);
$c$);
