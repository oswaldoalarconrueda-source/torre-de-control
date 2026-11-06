-- Regla de la skill: costo de mercancía = 0 en DEVOLUCIÓN (la mercancía regresa).
-- Velocidad: filtro por fecha_trans (índice) además de fecha_local, y permisos evaluados una sola vez.
create or replace function public.kpi_despacho(p_cuenta text, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles()) as ok),
  g as (
    select v.guia, v.estado_u, v.contenido,
      coalesce(nullif(v.valor_recaudo, 0), v.valor_declarado, 0) as venta,
      coalesce(v.valor_flete, 0) as flete,
      coalesce(v.nombre_transportadora_efficommerce, v.nombre_transportadora, 'Sin transportadora') as transportadora,
      w.costo, w.flete_dev, w.fulfillment, w.x4
    from public.v_guias v
    left join public.effi_mv_guia_wallet w on w.cuenta = v.cuenta and w.guia = v.guia
    where v.cuenta = p_cuenta and (select ok from permitido)
      and v.fecha_trans >= p_desde::timestamptz - interval '1 day' and v.fecha_trans < p_hasta::timestamptz + interval '2 days'
      and not v.anulada and v.estado_u <> 'EXCLUIDA'
      and v.fecha_local between p_desde and p_hasta
  ),
  historia as (
    select gg.contenido, gg.valor_recaudo, w.costo
    from public.effi_guias gg
    join public.effi_mv_guia_wallet w on w.cuenta = gg.cuenta and w.guia = gg.guia
    where gg.cuenta = p_cuenta and (select ok from permitido) and w.costo > 0 and gg.fecha_trans > now() - interval '120 days'
  ),
  por_contenido as (select contenido, avg(costo) as costo from historia group by 1),
  proporcion as (select sum(costo) / nullif(sum(valor_recaudo), 0) as r from historia),
  gc as (
    select g.*,
      (coalesce(g.costo, 0) = 0 and g.estado_u <> 'DEVOLUCION') as estimado,
      case when g.estado_u = 'DEVOLUCION' then 0
           else coalesce(nullif(g.costo, 0), pc.costo, g.venta * p.r, 0) end as costo_final
    from g
    left join por_contenido pc on pc.contenido = g.contenido
    cross join proporcion p
  )
  select jsonb_build_object(
    'despachado', jsonb_build_object(
      'n', count(*),
      'venta', coalesce(sum(venta), 0),
      'costo', coalesce(sum(costo_final), 0),
      'costo_estimadas', count(*) filter (where estimado),
      'flete', coalesce(sum(flete), 0)),
    'entregado', jsonb_build_object(
      'n', count(*) filter (where estado_u = 'ENTREGADO'),
      'venta', coalesce(sum(venta) filter (where estado_u = 'ENTREGADO'), 0),
      'costo', coalesce(sum(costo_final) filter (where estado_u = 'ENTREGADO'), 0),
      'costo_estimadas', count(*) filter (where estado_u = 'ENTREGADO' and estimado),
      'flete', coalesce(sum(flete) filter (where estado_u = 'ENTREGADO'), 0)),
    'devoluciones', jsonb_build_object(
      'n', count(*) filter (where estado_u = 'DEVOLUCION'),
      'flete_dev', coalesce(sum(flete_dev), 0)),
    'fulfillment_wallet', coalesce(sum(fulfillment), 0),
    'x4', coalesce(sum(x4), 0),
    'transportadoras', coalesce((
      select jsonb_agg(t order by t.envios desc) from (
        select transportadora as nombre, count(*) as envios, sum(flete) as flete
        from gc where estado_u = 'ENTREGADO' group by 1
      ) t), '[]'::jsonb)
  )
  from gc;
$$;
