-- 📦 Productos para todas las sociedades (A un clic y Valka además de Joalix), con una lectura más fiel del contenido
-- de la guía de Effi ("1 * DR. MELAXIN PEEL SHOT. 1 * ENVIO PRIORITARIO. "):
--   · prod_lineas: separa los productos solo donde empieza otro "N *", así un nombre con punto ("DR. MELAXIN") no se
--     corta, y el último producto cuenta aunque Effi haya cortado el texto sin punto final. En Joalix no cambia nada.
--   · prod_es_cargo: "Envío prioritario" es un cobro agregado al pedido, no un producto: no reparte la plata de la guía.
--   · prod_nombre: quita el "+ ENVÍO GRATIS" que Valka pone al final del nombre.

create or replace function public.prod_lineas(p_contenido text)
returns table (cant numeric, nombre text)
language sql immutable set search_path = '' as $$
  select greatest(m[1]::numeric, 1), btrim(regexp_replace(m[2], '\.\s*$', ''))
  from regexp_split_to_table(btrim(coalesce(p_contenido, '')), '\.\s+(?=\d+\s*\*)') p,
       regexp_match(p, '^\s*(\d+)\s*\*\s*(.+)$') m
  where m is not null;
$$;

create or replace function public.prod_es_cargo(p_nombre text) returns boolean
language sql immutable set search_path = '' as $$
  select public.prod_clave(p_nombre) ~ '^ENVIO PRIORITARIO';
$$;

create or replace function public.prod_nombre(p_cuenta text, p_nombre text) returns text
language sql stable set search_path = '' as $$
  with n as (select btrim(regexp_replace(coalesce(p_nombre, ''), '\s*\+\s*ENV[IÍ]O GRATIS\s*$', '', 'i')) as t)
  select coalesce(
    (select a.producto from public.prod_alias a, n
     where (a.cuenta is null or a.cuenta = p_cuenta) and public.prod_clave(n.t) ~ a.patron
     order by a.prioridad, a.id limit 1),
    (select nullif(initcap(lower(n.t)), '') from n), 'Sin producto');
$$;

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

create or replace function public.prod_productos_historicos(p_cuenta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('resumen')) as ok),
  lineas as (
    select 'e' as fuente, g.sucursal::text || '-' || g.id::text as doc, public.prod_nombre(p_cuenta, l.nombre) as producto
    from public.effi_guias g, public.prod_lineas(g.contenido) l
    where g.cuenta = p_cuenta and g.vigente is not false and (select ok from permitido) and not public.prod_es_cargo(l.nombre)
    union all
    select 'd', p.orden_id::text, public.prod_nombre(p_cuenta, p.producto)
    from public.dropi_orden_productos p
    where p.cuenta = p_cuenta and (select ok from permitido)
  ),
  v as (select producto, count(distinct (fuente, doc))::numeric as guias from lineas group by 1),
  pautados as (
    select producto from public.prod_campana_asignada where cuenta = p_cuenta and (select ok from permitido)
    union
    select public.prod_de_campana(p_cuenta, c.campana)
    from (select distinct campana from public.app_publicidad_campanas where cuenta = p_cuenta and (select ok from permitido)) c
  ),
  a as (select distinct producto, 0::numeric as guias from pautados
        where producto is not null and producto <> '' and producto not in (select producto from v))
  select coalesce(jsonb_agg(jsonb_build_object('producto', producto, 'guias', guias) order by guias desc, producto), '[]'::jsonb)
  from (select * from v union all select * from a) x;
$$;
revoke all on function public.prod_productos_historicos(text) from public, anon;
grant execute on function public.prod_productos_historicos(text) to authenticated;

-- Valka: nombres que Effi corta o escribe distinto son el mismo producto.
insert into public.prod_alias (cuenta, patron, producto, prioridad)
select v.* from (values
  ('VALKA_GT', '^HEPATOL', 'Hepatol - Desintoxicación Hepática', 40),
  ('VALKA_GT', '^MULTICOL+AGENO', 'Multicolágeno - Péptidos 1 Libra', 40),
  ('VALKA_GT', '^HIDRATANTE POST E', 'Hidratante Post Exfoliación', 40)
) v(cuenta, patron, producto, prioridad)
where not exists (select 1 from public.prod_alias a where a.cuenta = v.cuenta and a.patron = v.patron);
