-- 📊 Conteos del Agente como los ve el dueño en Effi, y pistas de por qué se anula una remisión.
-- - Órdenes del mes: todas las órdenes de venta del mes, como el listado de Effi (en Ecuador la orden queda "no
--   vigente" al pasar a remisión, así que no se puede filtrar por vigente). Se separan las anuladas sin remisión.
-- - Remisionadas del mes: órdenes que pasaron a remisión (con la remisión vigente).
-- - Hoy: órdenes de hoy, cuántas ya tienen remisión y cuántas ya tienen guía (lo que falta se ve a simple vista).
-- - La API de Effi no devuelve la observación de anulación de una remisión; sí devuelve el estado del dropshipping
--   (Aprobada / Pendiente de aprobación / Rechazada), que explica las anuladas porque el proveedor la rechazó.

alter table public.auto_ordenes add column rem_dropshipping text;

create or replace function public.auto_ingest(p_cuenta text, p_ordenes jsonb, p_remisiones jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
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
      (rem.x->>'id_guia_transporte')::int as id_guia, rem.x->>'guia' as guia,
      rem.x->>'estado_dropshipping' as rem_dropshipping
    from o
    left join rem on (rem.x->>'sucursal') = (o.x->>'sucursal_remision_v') and (rem.x->>'id') = (o.x->>'id_remision_v')
  )
  insert into public.auto_ordenes as a (cuenta, sucursal, id, fecha_orden, cliente, ciudad, provincia, total, ecommerce,
    pedido, convenio_orden, recuperado, est_orden, orden_vigente, responsable_orden, sucursal_remision, id_remision,
    rem_fecha, rem_centro, rem_centro_nombre, rem_convenio, rem_convenio_nombre, rem_vigente, rem_responsable, id_guia, guia,
    rem_dropshipping)
  select cuenta, sucursal, id, fecha_orden, cliente, ciudad, provincia, total, ecommerce, pedido, convenio_orden,
    recuperado, est_orden, orden_vigente, responsable_orden, sucursal_remision, id_remision, rem_fecha, rem_centro,
    rem_centro_nombre, rem_convenio, rem_convenio_nombre, rem_vigente, rem_responsable, id_guia, guia, rem_dropshipping
  from filas
  on conflict (cuenta, sucursal, id) do update set
    fecha_orden = excluded.fecha_orden, cliente = excluded.cliente, ciudad = excluded.ciudad,
    provincia = excluded.provincia, total = excluded.total, ecommerce = excluded.ecommerce, pedido = excluded.pedido,
    convenio_orden = excluded.convenio_orden, recuperado = excluded.recuperado, est_orden = excluded.est_orden,
    orden_vigente = excluded.orden_vigente, responsable_orden = excluded.responsable_orden,
    sucursal_remision = excluded.sucursal_remision, id_remision = excluded.id_remision,
    rem_fecha = coalesce(excluded.rem_fecha, a.rem_fecha), rem_centro = coalesce(excluded.rem_centro, a.rem_centro),
    rem_centro_nombre = coalesce(excluded.rem_centro_nombre, a.rem_centro_nombre),
    rem_convenio = coalesce(excluded.rem_convenio, a.rem_convenio),
    rem_convenio_nombre = coalesce(excluded.rem_convenio_nombre, a.rem_convenio_nombre),
    rem_vigente = coalesce(excluded.rem_vigente, a.rem_vigente),
    rem_responsable = coalesce(excluded.rem_responsable, a.rem_responsable),
    id_guia = coalesce(excluded.id_guia, a.id_guia), guia = coalesce(excluded.guia, a.guia),
    rem_dropshipping = coalesce(excluded.rem_dropshipping, a.rem_dropshipping),
    actualizado_en = now()
  where (a.fecha_orden, a.cliente, a.total, a.convenio_orden, a.est_orden, a.orden_vigente, a.id_remision,
         a.rem_centro, a.rem_convenio, a.rem_vigente, a.id_guia, a.guia, a.rem_dropshipping)
    is distinct from
        (excluded.fecha_orden, excluded.cliente, excluded.total, excluded.convenio_orden, excluded.est_orden,
         excluded.orden_vigente, excluded.id_remision, coalesce(excluded.rem_centro, a.rem_centro),
         coalesce(excluded.rem_convenio, a.rem_convenio), coalesce(excluded.rem_vigente, a.rem_vigente),
         coalesce(excluded.id_guia, a.id_guia), coalesce(excluded.guia, a.guia),
         coalesce(excluded.rem_dropshipping, a.rem_dropshipping));
  get diagnostics n = row_count;
  update public.auto_config set ultima_corrida = now(), ultimo_error = null where cuenta = p_cuenta;
  return n;
end $$;

create or replace function public.auto_lista(p_cuenta text, p_dias integer default 3)
returns jsonb language sql stable security definer set search_path = '' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('automatizacion')) as ok),
  cfg as (select * from public.auto_config where cuenta = p_cuenta),
  tz as (select tz_offset_min from public.effi_accounts where slug = p_cuenta),
  -- Órdenes del mes y de hoy en la hora del país.
  mes as (
    select x.*, (x.fecha_orden + make_interval(mins => (select tz_offset_min from tz)))::date as dia
    from public.auto_ordenes x
    where x.cuenta = p_cuenta and (select ok from permitido)
      and (x.fecha_orden + make_interval(mins => (select tz_offset_min from tz)))::date
          >= date_trunc('month', now() + make_interval(mins => (select tz_offset_min from tz)))::date
  ),
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
        case when b.rem_vigente = false then
          'La remisión está anulada' || case
            when b.rem_dropshipping = 'Rechazada' then ': el proveedor rechazó el dropshipping'
            when b.rem_dropshipping is not null then ' (dropshipping ' || lower(b.rem_dropshipping) || ')'
            else '' end end
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
                                         'ultimo_error', ultimo_error, 'actualizado_por', actualizado_por, 'cada_min', cada_min, 'cortes', cortes,
       'antes_min', antes_min, 'ultima_conversion', ultima_conversion, 'error_conversion', error_conversion) from cfg),
    'es_owner', public.app_es_owner(),
    'resumen', (select jsonb_build_object(
        'total', count(*),
        'completa', count(*) filter (where estado = 'completa'),
        'revision', count(*) filter (where estado = 'revision' and decision is distinct from 'descartar'),
        'sin_guia', count(*) filter (where estado = 'sin_guia'),
        'sin_remision', count(*) filter (where estado = 'sin_remision'),
        'anulada', count(*) filter (where estado = 'anulada'),
        'listas', count(*) filter (where estado = 'sin_remision' and plan_estado = 'lista'),
        'mes_total', (select count(*) from mes),
        'mes_anuladas', (select count(*) from mes where id_remision is null and orden_vigente is not true),
        'mes_remisionadas', (select count(*) from mes where id_remision is not null and rem_vigente is not false),
        'mes_rem_anuladas', (select count(*) from mes where rem_vigente = false),
        'mes_completas', (select count(*) from mes where id_remision is not null and guia is not null),
        'hoy_total', (select count(*) from mes where dia = (now() + make_interval(mins => (select tz_offset_min from tz)))::date),
        'hoy_remisiones', (select count(*) from mes where dia = (now() + make_interval(mins => (select tz_offset_min from tz)))::date
                             and id_remision is not null and rem_vigente is not false),
        'hoy_guias', (select count(*) from mes where dia = (now() + make_interval(mins => (select tz_offset_min from tz)))::date
                        and guia is not null),
        'hoy_completas', (select count(*) from mes where dia = (now() + make_interval(mins => (select tz_offset_min from tz)))::date
                            and id_remision is not null and guia is not null),
        'plan_revision', count(*) filter (where estado = 'sin_remision' and plan_estado = 'revision'),
        'recuperado', count(*) filter (where recuperado),
        'min_remision', round(avg(extract(epoch from (rem_fecha - fecha_orden)) / 60) filter (where rem_fecha is not null))
      ) from e),
    'ordenes', coalesce((select jsonb_agg(jsonb_build_object(
        'sucursal', sucursal, 'id', id, 'fecha', fecha_orden, 'cliente', cliente, 'ciudad', ciudad, 'provincia', provincia,
        'total', total, 'ecommerce', ecommerce, 'pedido', pedido, 'convenio', convenio_orden, 'recuperado', recuperado,
        'centro_esperado', centro_esperado, 'id_remision', id_remision, 'rem_fecha', rem_fecha,
        'rem_centro', rem_centro_nombre, 'rem_convenio', rem_convenio_nombre, 'rem_responsable', rem_responsable,
        'rem_dropshipping', rem_dropshipping,
        'guia', guia, 'estado', estado, 'motivos', motivos, 'minutos', minutos,
        'decision', decision, 'decision_por', decision_por, 'decision_en', decision_en,
        'plan', plan,
        'plan_estado', plan_estado,
        'plan_motivo', plan_motivo, 'plan_en', plan_en
      ) order by fecha_orden desc) from e), '[]'::jsonb)
  );
$$;
