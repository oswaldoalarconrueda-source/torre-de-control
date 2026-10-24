-- Datos, debajo del PyG: "Inconsistencias pendientes de pago" y "Proyección: si lo pendiente termina en devolución".
-- Inconsistencias: guías Effi entregadas sin recaudo en el wallet y órdenes Dropi entregadas sin ganancia en la
-- cartera, de cualquier fecha hasta el fin del periodo (se reclaman sin esperar días de rezago).
-- Proyección: guías y órdenes del periodo que siguen abiertas × flete de devolución promedio de su plataforma.

create function public.kpi_pendientes(p_cuenta text, p_desde date, p_hasta date, p_plataforma text default 'ambas') returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles()) as ok),
  costo_contenido as (
    select gg.contenido, avg(w.costo) as costo
    from public.effi_guias gg
    join public.effi_mv_guia_wallet w on w.cuenta = gg.cuenta and w.guia = gg.guia
    where gg.cuenta = p_cuenta and (select ok from permitido) and w.costo > 0 and gg.fecha_trans > now() - interval '120 days'
    group by 1
  ),
  inc as (
    select 'Effi' as plataforma, g.guia, g.fecha_local as fecha,
      coalesce(g.nombre_transportadora_efficommerce, g.nombre_transportadora) as transportadora,
      coalesce(nullif(g.valor_recaudo, 0), g.valor_declarado, 0) as venta,
      coalesce(nullif(w.costo, 0), cc.costo, 0) as costo,
      coalesce(g.valor_flete, 0) as flete,
      coalesce(w.flete_dev, 0) as flete_dev
    from public.v_guias g
    left join public.effi_mv_guia_wallet w on w.cuenta = g.cuenta and w.guia = g.guia
    left join costo_contenido cc on cc.contenido = g.contenido
    where g.cuenta = p_cuenta and (select ok from permitido) and p_plataforma in ('ambas', 'effi')
      and g.est_guia_efficommerce = 4 and g.recaudo and g.fecha_recaudo is null and not g.anulada
      and g.fecha_local <= p_hasta
    union all
    select 'Dropi', d.guia, d.fecha, d.transportadora, coalesce(d.venta, 0), coalesce(d.costo, 0),
      coalesce(d.flete, 0) + coalesce(d.comision, 0), coalesce(d.flete_dev_cartera, 0)
    from public.v_dropi_ordenes d
    where d.cuenta = p_cuenta and (select ok from permitido) and p_plataforma in ('ambas', 'dropi')
      and d.estatus = 'ENTREGADO' and d.ganancia_cartera is null and d.fecha <= p_hasta
  ),
  abiertas as (
    select 'Effi' as plataforma, v.estado_u, coalesce(w.fulfillment, 0) as fulfillment
    from public.v_guias v
    left join public.effi_mv_guia_wallet w on w.cuenta = v.cuenta and w.guia = v.guia
    where v.cuenta = p_cuenta and (select ok from permitido) and p_plataforma in ('ambas', 'effi')
      and v.fecha_trans >= p_desde::timestamptz - interval '1 day' and v.fecha_trans < p_hasta::timestamptz + interval '2 days'
      and v.fecha_local between p_desde and p_hasta
      and not v.anulada and v.estado_u in ('PENDIENTE', 'EN_TRANSITO', 'NOVEDAD', 'EN_OFICINA')
    union all
    select 'Dropi', d.estado_u, 0
    from public.v_dropi_ordenes d
    where d.cuenta = p_cuenta and (select ok from permitido) and p_plataforma in ('ambas', 'dropi')
      and d.fecha between p_desde and p_hasta and d.estado_u in ('PENDIENTE', 'EN_TRANSITO', 'NOVEDAD', 'EN_OFICINA')
  ),
  promedio as (
    select 'Effi' as plataforma, (select avg(flete_dev) from public.effi_mv_guia_wallet where cuenta = p_cuenta and flete_dev > 0) as flete_dev_prom
    union all
    select 'Dropi', (select avg(f) from (select -sum(valor) as f from public.dropi_cartera where cuenta = p_cuenta and concepto = 'flete_dev' group by orden_id) z)
  )
  select jsonb_build_object(
    'inconsistencias', coalesce((select jsonb_agg(to_jsonb(i) order by i.fecha, i.guia) from inc i), '[]'::jsonb),
    'proyeccion', coalesce((
      select jsonb_agg(jsonb_build_object('plataforma', a.plataforma, 'estado', a.estado_u, 'n', a.n,
               'flete_dev_prom', p.flete_dev_prom, 'flete_proyectado', a.n * coalesce(p.flete_dev_prom, 0), 'fulfillment', a.fulfillment)
             order by a.plataforma desc, array_position(array['EN_TRANSITO', 'NOVEDAD', 'EN_OFICINA', 'PENDIENTE'], a.estado_u))
      from (select plataforma, estado_u, count(*) as n, sum(fulfillment) as fulfillment from abiertas group by 1, 2) a
      join promedio p using (plataforma)), '[]'::jsonb)
  );
$$;
revoke all on function public.kpi_pendientes(text, date, date, text) from public, anon;
grant execute on function public.kpi_pendientes(text, date, date, text) to authenticated, service_role;
