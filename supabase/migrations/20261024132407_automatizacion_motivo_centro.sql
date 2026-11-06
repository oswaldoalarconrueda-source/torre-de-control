create or replace function public.auto_lista(p_cuenta text, p_dias integer default 3) returns jsonb
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
