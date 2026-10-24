-- Bloque "Despachado vs Entregado" de la pestaña Datos (como en el Dashboard Joalix).
-- Costo de mercancía: real (wallet "Compra de mercancía", que Effi cobra al entregar) o, si la guía
-- aún no lo tiene (devuelta, en camino, sin liquidar), estimado con el costo real promedio del mismo
-- contenido en los últimos 120 días; si el contenido no tiene historia, con la proporción costo/venta
-- de la cuenta.

create materialized view public.effi_mv_guia_wallet as
select
  cuenta,
  guia_inicial as guia,
  -coalesce(sum(valor) filter (where t_movimiento = 13), 0) as costo,
  -coalesce(sum(valor) filter (where t_movimiento in (7, 8)), 0) as flete,
  -coalesce(sum(valor) filter (where t_movimiento = 9), 0) as flete_dev,
  -coalesce(sum(valor) filter (where t_movimiento = 12), 0) as fulfillment,
  -coalesce(sum(valor) filter (where t_movimiento = 15), 0) as x4
from public.effi_wallet
where vigente is not false and guia_inicial is not null
group by 1, 2;
create unique index effi_mv_guia_wallet_pk on public.effi_mv_guia_wallet (cuenta, guia);
revoke all on public.effi_mv_guia_wallet from public, anon, authenticated;

create or replace function public.effi_refrescar_resumenes() returns void
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
begin
  refresh materialized view concurrently public.effi_mv_dia;
  refresh materialized view concurrently public.effi_mv_ciudad;
  refresh materialized view concurrently public.effi_mv_dia_dim;
  refresh materialized view concurrently public.effi_mv_guia_wallet;
end $$;

create function public.kpi_despacho(p_cuenta text, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with g as (
    select v.guia, v.estado_u, v.contenido,
      coalesce(nullif(v.valor_recaudo, 0), v.valor_declarado, 0) as venta,
      coalesce(v.valor_flete, 0) as flete,
      coalesce(v.nombre_transportadora_efficommerce, v.nombre_transportadora, 'Sin transportadora') as transportadora,
      w.costo, w.flete_dev, w.fulfillment, w.x4
    from public.v_guias v
    left join public.effi_mv_guia_wallet w on w.cuenta = v.cuenta and w.guia = v.guia
    where v.cuenta = p_cuenta and p_cuenta = any (public.app_cuentas_visibles())
      and not v.anulada and v.estado_u <> 'EXCLUIDA'
      and v.fecha_local between p_desde and p_hasta
  ),
  historia as (
    select v.contenido, v.valor_recaudo, w.costo
    from public.v_guias v
    join public.effi_mv_guia_wallet w on w.cuenta = v.cuenta and w.guia = v.guia
    where v.cuenta = p_cuenta and w.costo > 0 and v.fecha_trans > now() - interval '120 days'
  ),
  por_contenido as (select contenido, avg(costo) as costo from historia group by 1),
  proporcion as (select sum(costo) / nullif(sum(valor_recaudo), 0) as r from historia),
  gc as (
    select g.*,
      (coalesce(g.costo, 0) = 0) as estimado,
      coalesce(nullif(g.costo, 0), pc.costo, g.venta * p.r, 0) as costo_final
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
revoke all on function public.kpi_despacho(text, date, date) from public, anon;
grant execute on function public.kpi_despacho(text, date, date) to authenticated, service_role;
