-- 🤖 Agente de órdenes de venta, país por país (primero Guatemala). Por ahora la Torre VIGILA: cada 2 minutos trae
-- las órdenes de venta de los últimos 3 días y sus remisiones, y marca qué falta (remisión, guía) o qué está
-- mal (centro de costos, convenio). No crea nada en Effi: crear remisiones y guías se activa más adelante,
-- con visto bueno del dueño.
--
-- Reglas: la remisión debe llevar el convenio de dropshipping que trae la orden ("Dropshipping: XXXX" en la
-- observación) y, si el nombre del cliente empieza con *, ir por el centro de costos Recuperado.

create table public.auto_config (
  cuenta text primary key references public.effi_accounts (slug),
  modo text not null default 'vigilar' check (modo in ('apagado', 'vigilar', 'automatico')),
  centro_normal integer not null default 1,
  centro_recuperado integer not null default 4,
  minutos_alerta integer not null default 30,
  ultima_corrida timestamptz,
  ultimo_error text,
  actualizado_por text,
  actualizado_en timestamptz not null default now()
);
insert into public.auto_config (cuenta) values ('TIENDA_GT');

create table public.auto_ordenes (
  cuenta text not null references public.effi_accounts (slug),
  sucursal integer not null,
  id integer not null,
  fecha_orden timestamptz,
  cliente text,
  ciudad text,
  provincia text,
  total numeric,
  ecommerce text,
  pedido text,
  convenio_orden text,
  recuperado boolean not null default false,
  est_orden text,
  orden_vigente boolean,
  responsable_orden text,
  sucursal_remision integer,
  id_remision integer,
  rem_fecha timestamptz,
  rem_centro integer,
  rem_centro_nombre text,
  rem_convenio text,
  rem_convenio_nombre text,
  rem_vigente boolean,
  rem_responsable text,
  id_guia integer,
  guia text,
  decision text check (decision in ('ejecutar', 'descartar')),
  decision_por text,
  decision_en timestamptz,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, sucursal, id)
);
create index auto_ordenes_fecha on public.auto_ordenes (cuenta, fecha_orden desc);
comment on table public.auto_ordenes is 'Órdenes de venta vigiladas por la Torre con su remisión y guía (automatización).';

alter table public.auto_config enable row level security;
alter table public.auto_ordenes enable row level security;
create policy auto_config_leer on public.auto_config for select to authenticated
  using (cuenta = any ((select public.app_cuentas_visibles('automatizacion'))::text[]));
create policy auto_ordenes_leer on public.auto_ordenes for select to authenticated
  using (cuenta = any ((select public.app_cuentas_visibles('automatizacion'))::text[]));

-- Guarda lo que trae la función auto-vigilancia: p_ordenes y p_remisiones son arreglos de respuestas crudas
-- de Effi ({ok, data:[…], paginacion}). Solo reescribe las filas que cambiaron (cuida el disco).
create function public.auto_ingest(p_cuenta text, p_ordenes jsonb, p_remisiones jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with o as (
    select x from jsonb_array_elements(p_ordenes) r, jsonb_array_elements(r->'data') x
  ), rem as (
    select x from jsonb_array_elements(p_remisiones) r, jsonb_array_elements(r->'data') x
  ), filas as (
    select distinct on ((o.x->>'sucursal')::int, (o.x->>'id')::int)
      p_cuenta as cuenta, (o.x->>'sucursal')::int as sucursal, (o.x->>'id')::int as id,
      ((o.x->>'fecha_trans') || '+00')::timestamptz as fecha_orden,
      o.x->>'nombre_cliente' as cliente, o.x->>'nombre_ciudad' as ciudad, o.x->>'nombre_provincia' as provincia,
      (o.x->>'total')::numeric as total, o.x->>'nombre_ecommerce' as ecommerce, o.x->>'name_venta_ecommerce' as pedido,
      substring(o.x->>'observacion' from 'Dropshipping:\s*([A-Za-z0-9]+)') as convenio_orden,
      coalesce(ltrim(o.x->>'nombre_cliente') like '*%', false) as recuperado,
      o.x->>'estado' as est_orden, (o.x->>'vigente') = '1' as orden_vigente, o.x->>'responsable' as responsable_orden,
      (o.x->>'sucursal_remision_v')::int as sucursal_remision, (o.x->>'id_remision_v')::int as id_remision,
      ((rem.x->>'fecha_trans') || '+00')::timestamptz as rem_fecha,
      (rem.x->>'centro_costos')::int as rem_centro, rem.x->>'nombre_centro_costos' as rem_centro_nombre,
      rem.x->>'convenio_dropshipping' as rem_convenio, rem.x->>'nombre_convenio_dropshipping' as rem_convenio_nombre,
      case when rem.x is null then null else (rem.x->>'vigente') = '1' end as rem_vigente,
      rem.x->>'responsable' as rem_responsable,
      (rem.x->>'id_guia_transporte')::int as id_guia, rem.x->>'guia' as guia
    from o
    left join rem on (rem.x->>'sucursal') = (o.x->>'sucursal_remision_v') and (rem.x->>'id') = (o.x->>'id_remision_v')
  )
  insert into public.auto_ordenes as a (cuenta, sucursal, id, fecha_orden, cliente, ciudad, provincia, total, ecommerce,
    pedido, convenio_orden, recuperado, est_orden, orden_vigente, responsable_orden, sucursal_remision, id_remision,
    rem_fecha, rem_centro, rem_centro_nombre, rem_convenio, rem_convenio_nombre, rem_vigente, rem_responsable, id_guia, guia)
  select cuenta, sucursal, id, fecha_orden, cliente, ciudad, provincia, total, ecommerce, pedido, convenio_orden,
    recuperado, est_orden, orden_vigente, responsable_orden, sucursal_remision, id_remision, rem_fecha, rem_centro,
    rem_centro_nombre, rem_convenio, rem_convenio_nombre, rem_vigente, rem_responsable, id_guia, guia
  from filas
  on conflict (cuenta, sucursal, id) do update set
    fecha_orden = excluded.fecha_orden, cliente = excluded.cliente, ciudad = excluded.ciudad,
    provincia = excluded.provincia, total = excluded.total, ecommerce = excluded.ecommerce, pedido = excluded.pedido,
    convenio_orden = excluded.convenio_orden, recuperado = excluded.recuperado, est_orden = excluded.est_orden,
    orden_vigente = excluded.orden_vigente, responsable_orden = excluded.responsable_orden,
    sucursal_remision = excluded.sucursal_remision, id_remision = excluded.id_remision,
    -- Si la remisión ya no llega en la ventana de 3 días, se conservan sus datos anteriores.
    rem_fecha = coalesce(excluded.rem_fecha, a.rem_fecha), rem_centro = coalesce(excluded.rem_centro, a.rem_centro),
    rem_centro_nombre = coalesce(excluded.rem_centro_nombre, a.rem_centro_nombre),
    rem_convenio = coalesce(excluded.rem_convenio, a.rem_convenio),
    rem_convenio_nombre = coalesce(excluded.rem_convenio_nombre, a.rem_convenio_nombre),
    rem_vigente = coalesce(excluded.rem_vigente, a.rem_vigente),
    rem_responsable = coalesce(excluded.rem_responsable, a.rem_responsable),
    id_guia = coalesce(excluded.id_guia, a.id_guia), guia = coalesce(excluded.guia, a.guia),
    actualizado_en = now()
  where (a.fecha_orden, a.cliente, a.total, a.convenio_orden, a.est_orden, a.orden_vigente, a.id_remision,
         a.rem_centro, a.rem_convenio, a.rem_vigente, a.id_guia, a.guia)
    is distinct from
        (excluded.fecha_orden, excluded.cliente, excluded.total, excluded.convenio_orden, excluded.est_orden,
         excluded.orden_vigente, excluded.id_remision, coalesce(excluded.rem_centro, a.rem_centro),
         coalesce(excluded.rem_convenio, a.rem_convenio), coalesce(excluded.rem_vigente, a.rem_vigente),
         coalesce(excluded.id_guia, a.id_guia), coalesce(excluded.guia, a.guia));
  get diagnostics n = row_count;
  update public.auto_config set ultima_corrida = now(), ultimo_error = null where cuenta = p_cuenta;
  return n;
end $$;

create function public.auto_error(p_cuenta text, p_error text) returns void
language sql security definer set search_path = '' as $$
  update public.auto_config set ultima_corrida = now(), ultimo_error = left(p_error, 500) where cuenta = p_cuenta;
$$;

-- Lista para el menú: cada orden con su estado y los motivos de revisión. Estados:
--   completa      remisión vigente con guía y reglas bien
--   revision      tiene remisión pero algo no cumple (centro de costos, convenio) o la orden no trae convenio
--   sin_guia      remisión sin guía
--   sin_remision  orden vigente sin remisión
--   anulada       orden anulada sin remisión (no requiere nada)
create function public.auto_lista(p_cuenta text, p_dias integer default 3) returns jsonb
language sql stable security definer set search_path = '' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('automatizacion')) as ok),
  cfg as (select * from public.auto_config where cuenta = p_cuenta),
  base as (
    select a.*,
      case when a.recuperado then (select centro_recuperado from cfg) else (select centro_normal from cfg) end as centro_esperado
    from public.auto_ordenes a
    where a.cuenta = p_cuenta and (select ok from permitido)
      and a.fecha_orden >= now() - make_interval(days => greatest(1, least(p_dias, 30)))
  ),
  m as (
    select b.*,
      array_remove(array[
        case when b.convenio_orden is null then 'La orden no trae convenio' end,
        case when b.id_remision is not null and b.rem_centro is not null and b.rem_centro <> b.centro_esperado then
          case when b.recuperado then 'Cliente con * y la remisión no va por Recuperado'
               else 'Cliente sin * y la remisión va por ' || coalesce(b.rem_centro_nombre, 'otro centro de costos') end end,
        case when b.id_remision is not null and b.rem_convenio is not null and b.convenio_orden is not null
                  and b.rem_convenio <> b.convenio_orden then 'La remisión lleva otro convenio' end,
        case when b.id_remision is not null and b.rem_convenio is null and b.rem_fecha is not null then 'La remisión no lleva convenio' end,
        case when b.rem_vigente = false then 'La remisión está anulada' end
      ], null) as motivos
    from base b
  ),
  e as (
    select m.*,
      case when m.id_remision is null and m.orden_vigente is not true then 'anulada'
           when m.id_remision is null then 'sin_remision'
           when cardinality(m.motivos) > 0 then 'revision'
           when m.id_guia is null then 'sin_guia'
           else 'completa' end as estado,
      round(extract(epoch from (now() - m.fecha_orden)) / 60) as minutos
    from m
  )
  select jsonb_build_object(
    'config', (select jsonb_build_object('modo', modo, 'minutos_alerta', minutos_alerta, 'ultima_corrida', ultima_corrida,
                                         'ultimo_error', ultimo_error, 'actualizado_por', actualizado_por) from cfg),
    'es_owner', public.app_es_owner(),
    'resumen', (select jsonb_build_object(
        'total', count(*),
        'completa', count(*) filter (where estado = 'completa'),
        'revision', count(*) filter (where estado = 'revision' and decision is distinct from 'descartar'),
        'sin_guia', count(*) filter (where estado = 'sin_guia'),
        'sin_remision', count(*) filter (where estado = 'sin_remision'),
        'anulada', count(*) filter (where estado = 'anulada'),
        'recuperado', count(*) filter (where recuperado),
        'min_remision', round(avg(extract(epoch from (rem_fecha - fecha_orden)) / 60) filter (where rem_fecha is not null))
      ) from e),
    'ordenes', coalesce((select jsonb_agg(jsonb_build_object(
        'sucursal', sucursal, 'id', id, 'fecha', fecha_orden, 'cliente', cliente, 'ciudad', ciudad, 'provincia', provincia,
        'total', total, 'ecommerce', ecommerce, 'pedido', pedido, 'convenio', convenio_orden, 'recuperado', recuperado,
        'centro_esperado', centro_esperado, 'id_remision', id_remision, 'rem_fecha', rem_fecha,
        'rem_centro', rem_centro_nombre, 'rem_convenio', rem_convenio_nombre, 'rem_responsable', rem_responsable,
        'guia', guia, 'estado', estado, 'motivos', motivos, 'minutos', minutos,
        'decision', decision, 'decision_por', decision_por, 'decision_en', decision_en
      ) order by fecha_orden desc) from e), '[]'::jsonb)
  );
$$;

-- Solo el dueño cambia el modo. "automatico" queda bloqueado hasta activar la creación en Effi.
create function public.auto_cambiar_modo(p_cuenta text, p_modo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño puede cambiar el modo'; end if;
  if p_modo = 'automatico' then raise exception 'La creación automática aún no está activada'; end if;
  update public.auto_config
  set modo = p_modo, actualizado_en = now(), actualizado_por = (select email from auth.users where id = auth.uid())
  where cuenta = p_cuenta;
end $$;

-- Decisión del dueño sobre una orden: 'descartar' (no hacer nada) o null (quitar la decisión).
-- 'ejecutar' queda para cuando la creación en Effi esté activa.
create function public.auto_decidir(p_cuenta text, p_sucursal integer, p_id integer, p_decision text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño puede decidir'; end if;
  if p_decision = 'ejecutar' then raise exception 'La creación en Effi aún no está activada'; end if;
  update public.auto_ordenes
  set decision = p_decision, decision_en = case when p_decision is null then null else now() end,
      decision_por = case when p_decision is null then null else (select email from auth.users where id = auth.uid()) end
  where cuenta = p_cuenta and sucursal = p_sucursal and id = p_id;
end $$;

revoke all on function public.auto_ingest(text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.auto_error(text, text) from public, anon, authenticated;
revoke all on function public.auto_lista(text, integer) from public, anon;
revoke all on function public.auto_cambiar_modo(text, text) from public, anon;
revoke all on function public.auto_decidir(text, integer, integer, text) from public, anon;
grant execute on function public.auto_lista(text, integer) to authenticated;
grant execute on function public.auto_cambiar_modo(text, text) to authenticated;
grant execute on function public.auto_decidir(text, integer, integer, text) to authenticated;

-- Disparo del cron (mismo token que effi-sync).
create function public.auto_vigilancia_disparar() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-vigilancia',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
$$;
revoke all on function public.auto_vigilancia_disparar() from public, anon, authenticated;
