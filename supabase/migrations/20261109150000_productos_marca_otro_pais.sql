-- * rojo en pantalla para las campañas con pauta entregada en otro país (lo pidió el dueño el 9-nov-2026: la de A un clic
-- en Colombia se carga a Honduras y debe verse de dónde viene). productos_datos trae "otros" [campaña, producto, países]
-- y prod_campanas trae "otros_paises" por campaña.

create or replace function public.productos_datos(p_cuenta text, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('resumen')) as ok),
  g as (
    select v.guia, v.estado_u, v.contenido, v.nombre_empresa_proveedor as proveedor, v.fecha_local as d,
      coalesce(w.recaudo, 0) as venta, coalesce(w.costo, 0) as costo, coalesce(w.flete, 0) as flete,
      coalesce(w.fulfillment, 0) as ful, coalesce(w.x4, 0) as x4, coalesce(w.flete_dev, 0) as fdv
    from public.v_guias v
    left join public.effi_mv_guia_wallet w on w.cuenta = v.cuenta and w.guia = v.guia
    where v.cuenta = p_cuenta and (select ok from permitido) and not v.anulada
      and v.fecha_trans >= p_desde::timestamptz - interval '1 day' and v.fecha_trans < p_hasta::timestamptz + interval '2 days'
      and v.fecha_local between p_desde and p_hasta
  ),
  gp as (
    select g.*, coalesce(i.nombre, '') as nombre,
      coalesce(i.cant / nullif(sum(i.cant) over (partition by g.guia), 0), 1) as peso, 'effi' as pl
    from g
    left join lateral (
      select l.nombre, l.cant from public.prod_lineas(g.contenido) l
      where not public.prod_es_cargo(l.nombre)) i on true
  ),
  o as (
    select o.id, o.fecha as d, o.estado_u, o.ganancia_cartera is not null as liq,
      coalesce(o.venta, 0) as venta, coalesce(o.costo, 0) as costo, coalesce(o.flete, 0) as flete,
      coalesce(o.comision, 0) as comision, coalesce(o.flete_dev_cartera, 0) as fdv
    from public.v_dropi_ordenes o
    where o.cuenta = p_cuenta and (select ok from permitido) and o.fecha between p_desde and p_hasta
      and o.estado_u is distinct from 'EXCLUIDA'
  ),
  op as (
    select o.*, coalesce(i.producto, '') as nombre,
      coalesce(i.cantidad / nullif(sum(i.cantidad) over (partition by o.id), 0), 1) as peso, 'dropi' as pl
    from o
    left join lateral (
      select p.producto, greatest(coalesce(p.cantidad, 1), 1)::numeric as cantidad
      from public.dropi_orden_productos p where p.cuenta = p_cuenta and p.orden_id = o.id) i on true
  ),
  nombres as (
    select n.nombre, public.prod_nombre(p_cuenta, n.nombre) as producto
    from (select nombre from gp union select nombre from op) n
  ),
  todo as (
    select gp.d, nm.producto, gp.estado_u, gp.pl, gp.proveedor, gp.peso,
      gp.venta * gp.peso as venta, gp.costo * gp.peso as costo, gp.flete * gp.peso as flete,
      gp.ful * gp.peso as ful, gp.x4 * gp.peso as x4, gp.fdv * gp.peso as fdv
    from gp join nombres nm on nm.nombre = gp.nombre
    union all
    select op.d, nm.producto, op.estado_u, op.pl, null, op.peso,
      case when op.liq then op.venta * op.peso else 0 end, case when op.liq then op.costo * op.peso else 0 end,
      case when op.liq then op.flete * op.peso else 0 end, case when op.liq then op.comision * op.peso else 0 end,
      0, op.fdv * op.peso
    from op join nombres nm on nm.nombre = op.nombre
  ),
  c as (
    select c.fecha as d, c.cuenta_ads as b, c.campana, sum(c.monto_cop) as v
    from public.app_publicidad_campanas c
    where c.cuenta = p_cuenta and (select ok from permitido) and c.fecha between p_desde and p_hasta
    group by 1, 2, 3
  ),
  cp as (select x.campana, public.prod_de_campana(p_cuenta, x.campana) as producto from (select distinct campana from c) x),
  -- Campañas con pauta entregada en otro país (p. ej. A un clic Colombia cargada a Honduras): se marcan con * en pantalla.
  otros as (
    select x.campana, string_agg(distinct t, ',' order by t) as paises
    from public.app_publicidad_campanas x, unnest(string_to_array(x.pais, ',')) t
    where x.cuenta = p_cuenta and (select ok from permitido) and x.fecha between p_desde and p_hasta
      and t <> (select a.pais from public.effi_accounts a where a.slug = p_cuenta)
    group by 1
  ),
  meses as (
    select m::date as mes from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') m
  )
  select jsonb_build_object(
    'econ', coalesce((select jsonb_agg(jsonb_build_array(d, producto, round(ent, 3), round(dev, 3), round(pend, 3),
        round(venta, 2), round(costo, 2), round(flete, 2), round(ful, 2), round(x4, 2), round(fdv, 2)) order by d, producto)
      from (select d, producto,
          sum(peso) filter (where estado_u = 'ENTREGADO') as ent,
          sum(peso) filter (where estado_u = 'DEVOLUCION') as dev,
          sum(peso) filter (where estado_u in ('PENDIENTE', 'EN_TRANSITO', 'NOVEDAD', 'EN_OFICINA')) as pend,
          sum(venta) as venta, sum(costo) as costo, sum(flete) as flete, sum(ful) as ful, sum(x4) as x4, sum(fdv) as fdv
        from todo group by 1, 2) e), '[]'::jsonb),
    'estados', coalesce((select jsonb_agg(jsonb_build_array(d, producto, estado_u, pl, proveedor, n) order by d)
      from (select d, producto, estado_u, pl, proveedor, count(*) as n from todo group by 1, 2, 3, 4, 5) s), '[]'::jsonb),
    'ads', coalesce((select jsonb_agg(jsonb_build_array(d, producto, round(v)) order by d)
      from (select c.d, cp.producto, sum(c.v) as v from c join cp using (campana) where cp.producto is not null group by 1, 2) a), '[]'::jsonb),
    'sin', coalesce((select jsonb_agg(jsonb_build_array(c.d, c.b, c.campana, round(c.v)) order by c.d)
      from c join cp using (campana) where cp.producto is null), '[]'::jsonb),
    'otros', coalesce((select jsonb_agg(jsonb_build_array(o.campana, cp.producto, o.paises) order by o.campana)
      from otros o left join cp using (campana)), '[]'::jsonb),
    'ads_dia', coalesce((select jsonb_agg(jsonb_build_array(d, round(v)) order by d)
      from (select fecha as d, sum(monto_cop) as v from public.app_publicidad_diaria
            where cuenta = p_cuenta and (select ok from permitido) and fecha between p_desde and p_hasta group by 1) t), '[]'::jsonb),
    'meses', coalesce((select jsonb_object_agg(to_char(mm.mes, 'YYYY-MM'), jsonb_build_object(
        'factor', public.app_cop_a_local(p_cuenta, 1, mm.mes),
        'gastos', (select coalesce(sum(gm.monto), 0) from public.app_gastos_mensuales gm where gm.cuenta = p_cuenta and gm.mes = mm.mes),
        'entregas', (select count(*) from public.v_guias v where v.cuenta = p_cuenta and not v.anulada and v.estado_u = 'ENTREGADO'
                       and v.fecha_trans >= mm.mes::timestamptz - interval '1 day' and v.fecha_trans < (mm.mes + interval '1 month')::timestamptz + interval '1 day'
                       and v.fecha_local >= mm.mes and v.fecha_local < mm.mes + interval '1 month')
                    + (select count(*) from public.v_dropi_ordenes o where o.cuenta = p_cuenta and o.estado_u = 'ENTREGADO'
                       and o.fecha >= mm.mes and o.fecha < mm.mes + interval '1 month')))
      from meses mm where (select ok from permitido)), '{}'::jsonb)
  );
$$;

create or replace function public.prod_campanas(p_cuenta text, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('resumen')) as ok),
  c as (
    select c.campana, string_agg(distinct c.cuenta_ads, ', ') as cuentas, sum(c.monto_cop) as cop,
      count(distinct c.fecha) as dias, min(c.fecha) as desde, max(c.fecha) as hasta,
      array_agg(distinct c.cuenta_ads) as cuentas_arr
    from public.app_publicidad_campanas c
    where c.cuenta = p_cuenta and (select ok from permitido) and c.fecha between p_desde and p_hasta
    group by 1
  ),
  h as (
    select x.campana, min(x.fecha) as primer_gasto, max(x.fecha) as ultimo_gasto
    from public.app_publicidad_campanas x
    where x.cuenta = p_cuenta and x.campana in (select campana from c)
    group by 1
  )
  select jsonb_build_object(
    'campanas', coalesce((select jsonb_agg(jsonb_build_object('campana', c.campana, 'cuentas', c.cuentas, 'cop', round(c.cop),
        'dias', c.dias, 'desde', c.desde, 'hasta', c.hasta,
        'primer_gasto', h.primer_gasto, 'ultimo_gasto', h.ultimo_gasto,
        'creada', (m.creada at time zone 'America/Bogota')::date, 'inicio', (m.inicio at time zone 'America/Bogota')::date,
        'fin', (m.fin at time zone 'America/Bogota')::date, 'estado', m.estado,
        'otros_paises', (select string_agg(distinct t, ',' order by t)
          from public.app_publicidad_campanas x, unnest(string_to_array(x.pais, ',')) t
          where x.cuenta = p_cuenta and x.campana = c.campana and x.fecha between p_desde and p_hasta
            and t <> (select a.pais from public.effi_accounts a where a.slug = p_cuenta)),
        'manual', a.producto, 'asignado_por', a.asignado_por,
        'regla', r.producto, 'patron', r.patron) order by c.cop desc)
      from c
      left join h on h.campana = c.campana
      left join lateral (
        select min(mc.creada) as creada, min(mc.inicio) as inicio, max(mc.fin) as fin,
          -- si la misma campaña está en varias cuentas, la que siga activa manda
          (array_agg(mc.estado order by (mc.estado = 'ACTIVE') desc, mc.actualizado_en desc))[1] as estado
        from public.meta_campanas mc where mc.nombre = c.campana and mc.cuenta_ads = any (c.cuentas_arr)
      ) m on true
      left join public.prod_campana_asignada a on a.cuenta = p_cuenta and a.campana = c.campana
      left join lateral (select r.producto, r.patron from public.prod_campana_reglas r
        where (r.cuenta is null or r.cuenta = p_cuenta) and public.prod_clave(c.campana) ~ r.patron
        order by r.prioridad, r.id limit 1) r on true), '[]'::jsonb),
    'productos', coalesce((select jsonb_agg(distinct x.p order by x.p) from (
        select producto as p from public.prod_alias where cuenta is null or cuenta = p_cuenta
        union select producto from public.prod_campana_reglas where cuenta is null or cuenta = p_cuenta
        union select producto from public.prod_campana_asignada where cuenta = p_cuenta) x where (select ok from permitido)), '[]'::jsonb)
  );
$$;
revoke all on function public.prod_campanas(text, date, date) from public, anon;
grant execute on function public.prod_campanas(text, date, date) to authenticated;
