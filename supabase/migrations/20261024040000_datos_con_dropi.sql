-- Datos con Dropi: despachado/entregado y utilidad neta suman Effi + Dropi (o una sola plataforma),
-- igual que el filtro Ambas / Effi / Dropi del Dashboard Joalix.

drop function public.kpi_despacho(text, date, date);
create function public.kpi_despacho(p_cuenta text, p_desde date, p_hasta date, p_plataforma text default 'ambas') returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles()) as ok),
  g as (
    select 'Effi' as plataforma, v.guia, v.estado_u, v.contenido,
      coalesce(nullif(v.valor_recaudo, 0), v.valor_declarado, 0) as venta,
      coalesce(v.valor_flete, 0) as flete,
      coalesce(v.nombre_transportadora_efficommerce, v.nombre_transportadora, 'Sin transportadora') as transportadora,
      w.costo, w.flete_dev, w.fulfillment, w.x4
    from public.v_guias v
    left join public.effi_mv_guia_wallet w on w.cuenta = v.cuenta and w.guia = v.guia
    where v.cuenta = p_cuenta and (select ok from permitido) and p_plataforma in ('ambas', 'effi')
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
    select g.plataforma, g.guia, g.estado_u, g.venta, g.flete, g.transportadora, g.flete_dev, g.fulfillment, g.x4,
      (coalesce(g.costo, 0) = 0 and g.estado_u <> 'DEVOLUCION') as estimado,
      case when g.estado_u = 'DEVOLUCION' then 0
           else coalesce(nullif(g.costo, 0), pc.costo, g.venta * p.r, 0) end as costo_final
    from g
    left join por_contenido pc on pc.contenido = g.contenido
    cross join proporcion p
    union all
    -- Dropi: el costo del proveedor viene en la orden; la comisión hace las veces de fulfillment (solo en entregadas).
    select 'Dropi', d.guia, d.estado_u, coalesce(d.venta, 0), coalesce(d.flete, 0), coalesce(d.transportadora, 'Sin transportadora'),
      d.flete_dev_cartera, case when d.estado_u = 'ENTREGADO' then d.comision end, 0::numeric,
      false, case when d.estado_u = 'DEVOLUCION' then 0 else coalesce(d.costo, 0) end
    from public.v_dropi_ordenes d
    where d.cuenta = p_cuenta and (select ok from permitido) and p_plataforma in ('ambas', 'dropi')
      and d.fecha between p_desde and p_hasta and d.estado_u <> 'EXCLUIDA'
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
    'plataformas', jsonb_build_object(
      'effi', count(*) filter (where plataforma = 'Effi'),
      'effi_entregadas', count(*) filter (where plataforma = 'Effi' and estado_u = 'ENTREGADO'),
      'dropi', count(*) filter (where plataforma = 'Dropi'),
      'dropi_entregadas', count(*) filter (where plataforma = 'Dropi' and estado_u = 'ENTREGADO')),
    'fulfillment_wallet', coalesce(sum(fulfillment) filter (where plataforma = 'Effi'), 0),
    'comision_dropi', coalesce(sum(fulfillment) filter (where plataforma = 'Dropi'), 0),
    'x4', coalesce(sum(x4), 0),
    'transportadoras', coalesce((
      select jsonb_agg(t order by t.envios desc) from (
        select transportadora as nombre, count(*) as envios, sum(flete) as flete
        from gc where estado_u = 'ENTREGADO' group by 1
      ) t), '[]'::jsonb)
  )
  from gc;
$$;
revoke all on function public.kpi_despacho(text, date, date, text) from public, anon;
grant execute on function public.kpi_despacho(text, date, date, text) to authenticated, service_role;

drop function public.kpi_utilidad(text, date, date);
create function public.kpi_utilidad(p_cuenta text, p_desde date, p_hasta date, p_plataforma text default 'ambas') returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles()) as ok),
  g as (
    select v.guia, v.estado_u, w.recaudo, w.costo, w.flete, w.flete_dev, w.fulfillment, w.x4,
      w.indemnizacion, w.credito_revertido, w.debito_revertido, w.otros
    from public.v_guias v
    left join public.effi_mv_guia_wallet w on w.cuenta = v.cuenta and w.guia = v.guia
    where v.cuenta = p_cuenta and (select ok from permitido) and p_plataforma in ('ambas', 'effi')
      and v.fecha_trans >= p_desde::timestamptz - interval '1 day' and v.fecha_trans < p_hasta::timestamptz + interval '2 days'
      and v.fecha_local between p_desde and p_hasta
  ),
  -- Dropi: órdenes del periodo (por fecha de la orden) y movimientos de cartera fechados por su orden
  -- (o por el día del movimiento si la orden no está cargada). Sin retiros, transferencias ni recargas.
  d as (
    select * from public.v_dropi_ordenes
    where cuenta = p_cuenta and (select ok from permitido) and p_plataforma in ('ambas', 'dropi') and fecha between p_desde and p_hasta
  ),
  dc as (
    select c.concepto, c.valor, o.id is not null as con_orden
    from public.dropi_cartera c
    left join public.dropi_ordenes o on o.cuenta = c.cuenta and o.id = c.orden_id
    where c.cuenta = p_cuenta and (select ok from permitido) and p_plataforma in ('ambas', 'dropi')
      and c.concepto not in ('retiro', 'transferencia', 'recarga')
      and coalesce(o.fecha, c.fecha::date) between p_desde and p_hasta
  ),
  pyg as (
    select plataforma, concepto, monto, n, orden from (
      select 'Effi' as plataforma, 'Recaudo de venta' as concepto, sum(recaudo) as monto, count(*) filter (where recaudo <> 0) as n, 1 as orden from g
      union all select 'Effi', 'Costo de mercancía vendida', -sum(costo), count(*) filter (where costo <> 0), 2 from g
      union all select 'Effi', 'Flete de envío', -sum(flete), count(*) filter (where flete <> 0), 3 from g
      union all select 'Effi', 'Flete de devolución', -sum(flete_dev), count(*) filter (where flete_dev <> 0), 4 from g
      union all select 'Effi', 'Fulfillment', -sum(fulfillment), count(*) filter (where fulfillment <> 0), 5 from g
      union all select 'Effi', 'Impuesto 4x1000', -sum(x4), count(*) filter (where x4 <> 0), 6 from g
      union all select 'Effi', 'Entrada por indemnización', sum(indemnizacion), count(*) filter (where indemnizacion <> 0), 7 from g
      union all select 'Effi', 'Crédito revertido', sum(credito_revertido), count(*) filter (where credito_revertido <> 0), 8 from g
      union all select 'Effi', 'Débito revertido', sum(debito_revertido), count(*) filter (where debito_revertido <> 0), 9 from g
      union all select 'Effi', 'Otros movimientos', sum(otros), count(*) filter (where otros <> 0), 10 from g
      union all
      select 'Effi', a.concepto, sum(a.monto), sum(a.n)::bigint, 11 from public.app_ajustes_pyg a
      where a.cuenta = p_cuenta and (select ok from permitido) and p_plataforma in ('ambas', 'effi') and a.fecha between p_desde and p_hasta group by a.concepto
      -- Dropi paga la ganancia neta; se abre en recaudo, costo, flete y comisión con los valores de la orden.
      union all select 'Dropi', 'Recaudo de venta', sum(venta) filter (where ganancia_cartera is not null), count(*) filter (where ganancia_cartera is not null), 21 from d
      union all select 'Dropi', 'Costo de mercancía vendida', -sum(costo) filter (where ganancia_cartera is not null), count(*) filter (where ganancia_cartera is not null), 22 from d
      union all select 'Dropi', 'Flete de envío', -sum(flete) filter (where ganancia_cartera is not null), count(*) filter (where ganancia_cartera is not null), 23 from d
      union all select 'Dropi', 'Comisión Dropi', -sum(comision) filter (where ganancia_cartera is not null), count(*) filter (where ganancia_cartera is not null and comision <> 0), 24 from d
      union all select 'Dropi', 'Ajuste de cartera', sum(ganancia_cartera - (coalesce(venta, 0) - coalesce(costo, 0) - coalesce(flete, 0) - coalesce(comision, 0))) filter (where ganancia_cartera is not null),
        count(*) filter (where ganancia_cartera is not null and ganancia_cartera <> coalesce(venta, 0) - coalesce(costo, 0) - coalesce(flete, 0) - coalesce(comision, 0)), 25 from d
      union all select 'Dropi', 'Ganancia de órdenes no cargadas', sum(valor), count(*), 26 from dc where concepto = 'ganancia' and not con_orden
      union all select 'Dropi', 'Flete de devolución', sum(valor), count(*), 27 from dc where concepto = 'flete_dev'
      union all select 'Dropi', 'Entrada por garantía', sum(valor), count(*), 28 from dc where concepto = 'garantia_entrada'
      union all select 'Dropi', 'Salida por reposición de garantía', sum(valor), count(*), 29 from dc where concepto = 'garantia_salida'
      union all select 'Dropi', 'Corrección de estado', sum(valor), count(*), 30 from dc where concepto = 'correccion'
      union all select 'Dropi', 'Otros cargos Dropi', sum(valor), count(*), 31 from dc where concepto = 'otro'
    ) x where coalesce(monto, 0) <> 0
  ),
  -- Peor caso: todo lo pendiente termina devuelto y paga el flete de devolución promedio real de su plataforma.
  proy as (
    select 'Effi' as plataforma,
      (select count(*) from public.v_guias v
       where v.cuenta = p_cuenta and (select ok from permitido) and p_plataforma in ('ambas', 'effi')
         and v.fecha_trans >= p_desde::timestamptz - interval '1 day' and v.fecha_trans < p_hasta::timestamptz + interval '2 days'
         and v.fecha_local between p_desde and p_hasta
         and not v.anulada and v.estado_u in ('PENDIENTE', 'EN_TRANSITO', 'NOVEDAD', 'EN_OFICINA')) as n,
      (select avg(flete_dev) from public.effi_mv_guia_wallet where cuenta = p_cuenta and flete_dev > 0) as flete_dev_prom
    union all
    select 'Dropi',
      (select count(*) from d where estado_u in ('PENDIENTE', 'EN_TRANSITO', 'NOVEDAD', 'EN_OFICINA')),
      (select avg(f) from (select -sum(valor) as f from public.dropi_cartera where cuenta = p_cuenta and concepto = 'flete_dev' group by orden_id) z)
  ),
  ads_mes as (
    select date_trunc('month', fecha)::date as mes, sum(monto_cop) as cop, count(distinct fecha) as dias, max(fecha) as ultimo
    from public.app_publicidad_diaria
    where cuenta = p_cuenta and (select ok from permitido) and fecha between p_desde and p_hasta
    group by 1
  ),
  ads_cuentas as (
    select cuenta_ads as nombre, sum(monto_cop) as cop,
      sum(public.app_cop_a_local(p_cuenta, monto_cop, date_trunc('month', fecha)::date)) as monto
    from public.app_publicidad_diaria
    where cuenta = p_cuenta and (select ok from permitido) and fecha between p_desde and p_hasta
    group by 1
  ),
  meses as (
    select generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month')::date as mes
  ),
  ads as (
    select
      case when exists (select 1 from ads_mes) then 'diaria'
           when exists (select 1 from public.app_publicidad_mensual m join meses using (mes) where m.cuenta = p_cuenta) then 'mensual' end as fuente,
      coalesce((select sum(public.app_cop_a_local(p_cuenta, cop, mes)) from ads_mes),
               (select sum(m.monto) from public.app_publicidad_mensual m join meses using (mes) where m.cuenta = p_cuenta and (select ok from permitido))) as monto,
      (select sum(cop) from ads_mes) as cop,
      (select sum(dias) from ads_mes) as dias,
      (select max(ultimo) from ads_mes) as ultimo,
      (select max(fecha) from public.app_publicidad_diaria where cuenta = p_cuenta and (select ok from permitido)) as ultimo_cargado
  ),
  gastos as (
    select tipo, sum(monto) as total,
      jsonb_agg(jsonb_build_object('mes', to_char(mes, 'YYYY-MM'), 'concepto', concepto, 'monto', monto) order by mes, monto desc) as detalle
    from public.app_gastos_mensuales join meses using (mes)
    where cuenta = p_cuenta and (select ok from permitido)
    group by 1
  ),
  r as (
    select
      (select coalesce(sum(monto), 0) from pyg) as pyg_total,
      (select coalesce(sum(n * coalesce(flete_dev_prom, 0)), 0) from proy) as proyeccion,
      coalesce((select monto from ads), 0) as publicidad,
      coalesce((select total from gastos where tipo = 'apps'), 0) as apps,
      coalesce((select total from gastos where tipo = 'admin'), 0) as admin,
      coalesce((select total from gastos where tipo = 'operativo'), 0) as operativo
  )
  select jsonb_build_object(
    'pyg', coalesce((select jsonb_agg(jsonb_build_object('plataforma', plataforma, 'concepto', concepto, 'monto', monto, 'n', n) order by orden) from pyg), '[]'::jsonb),
    'pyg_total', r.pyg_total,
    'proyeccion', jsonb_build_object(
      'total', r.proyeccion,
      'n', (select sum(n) from proy),
      'detalle', (select jsonb_agg(jsonb_build_object('plataforma', plataforma, 'n', n, 'flete_dev_prom', flete_dev_prom, 'total', n * coalesce(flete_dev_prom, 0))) from proy where n > 0)),
    'publicidad', (select jsonb_build_object('fuente', fuente, 'total', monto, 'cop', cop, 'dias', dias, 'ultimo', ultimo, 'ultimo_cargado', ultimo_cargado,
                     'cuentas', coalesce((select jsonb_agg(c order by c.cop desc) from ads_cuentas c), '[]'::jsonb)) from ads),
    'gastos', jsonb_build_object(
      'meses', (select jsonb_agg(to_char(mes, 'YYYY-MM')) from meses),
      'apps', jsonb_build_object('total', r.apps, 'detalle', coalesce((select detalle from gastos where tipo = 'apps'), '[]'::jsonb)),
      'admin', jsonb_build_object('total', r.admin, 'detalle', coalesce((select detalle from gastos where tipo = 'admin'), '[]'::jsonb)),
      'operativo', jsonb_build_object('total', r.operativo, 'detalle', coalesce((select detalle from gastos where tipo = 'operativo'), '[]'::jsonb))),
    'dropi', jsonb_build_object(
      'ordenes', (select count(*) from public.dropi_ordenes where cuenta = p_cuenta and (select ok from permitido)),
      'ultima_orden', (select max(fecha) from public.dropi_ordenes where cuenta = p_cuenta and (select ok from permitido)),
      'ultima_cartera', (select max(fecha)::date from public.dropi_cartera where cuenta = p_cuenta and (select ok from permitido))),
    'utilidad_neta', r.pyg_total - r.proyeccion - r.publicidad - r.apps - r.admin - r.operativo
  )
  from r;
$$;
revoke all on function public.kpi_utilidad(text, date, date, text) from public, anon;
grant execute on function public.kpi_utilidad(text, date, date, text) to authenticated, service_role;
