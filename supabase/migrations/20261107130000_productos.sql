-- 📦 Productos (pedido del dueño, 7-nov; réplica del menú Productos del Dashboard Joalix): desempeño por producto con la
-- publicidad de Meta homologada por campaña. Tres piezas:
--   · prod_alias: nombre canónico del producto a partir del contenido de la guía (Effi) o del producto de Dropi.
--   · prod_campana_reglas: palabra del nombre de la campaña → producto (por tienda o para todas). Primero la de menor
--     prioridad. Lo que no encaja queda "Sin identificar": nunca se reparte por defecto.
--   · prod_campana_asignada: lo que el dueño o un socio asigna a mano desde la pantalla; manda sobre las reglas.
-- productos_datos entrega por día y producto lo que la pantalla necesita (montos en moneda local; publicidad en COP).

create or replace function public.prod_clave(t text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(upper(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNAEIOUUN')), '\s+', ' ', 'g'));
$$;

create table if not exists public.prod_alias (
  id bigserial primary key,
  cuenta text references public.effi_accounts (slug), -- null = todas las tiendas
  patron text not null,                                 -- regex sobre prod_clave(nombre)
  producto text not null,
  prioridad int not null default 100
);
alter table public.prod_alias enable row level security;

create table if not exists public.prod_campana_reglas (
  id bigserial primary key,
  cuenta text references public.effi_accounts (slug), -- null = todas las tiendas
  patron text not null,                                 -- regex sobre prod_clave(campaña)
  producto text not null,
  prioridad int not null default 100,
  nota text,
  creado_en timestamptz not null default now()
);
alter table public.prod_campana_reglas enable row level security;

create table if not exists public.prod_campana_asignada (
  cuenta text not null references public.effi_accounts (slug),
  campana text not null,
  producto text not null,
  asignado_por text,
  asignado_en timestamptz not null default now(),
  primary key (cuenta, campana)
);
alter table public.prod_campana_asignada enable row level security;

-- Catálogo de Joalix (nombres de las guías de sep–nov 2026).
insert into public.prod_alias (patron, producto, prioridad) values
  ('DRENAJE|LYMPHATIC|LINFATIC', 'Drenaje Linfático', 50),
  ('BERBER', 'Berberine Gotas', 50),
  ('VINO|ROMPE ?CALC', 'Vino Rompe Cálculos', 50),
  ('AGUAJE', 'Aguaje Complex 3-1', 50),
  ('ZOO+NE', 'Zoone', 50),
  ('CLOROF', 'Clorofila', 50),
  ('MULLEIN', 'Mullein', 50),
  ('BEEVANA', 'Beevana', 50),
  ('OFTALMIEL', 'Oftalmiel', 50),
  ('STONE', 'Stone Disolver', 50),
  ('NIPPORI', 'Nippori Shampoo', 50),
  ('AIRI|DEBLOAT', 'Airi Debloat', 50),
  ('CANDELA', 'Candela Cream', 50),
  ('BREATY', 'Breatyfresh', 50),
  ('CURCUMA|FUNRICH', 'Funrich Cúrcuma', 50);

-- Homologación de campañas (skill del menú Productos, confirmada por el dueño, más las palabras de las campañas actuales).
insert into public.prod_campana_reglas (cuenta, patron, producto, prioridad, nota) values
  ('TIENDA_CO', 'VENTKIT|KITREPARADOR', 'Test', 10, 'Producto ficticio: solo el gasto de esas campañas'),
  ('TIENDA_CO', 'VINO|ROMPE', 'Vino Rompe Cálculos', 20, 'El vino solo se vende en Colombia'),
  (null, 'BERBER', 'Berberine Gotas', 30, null),
  (null, 'AGUAJE', 'Aguaje Complex 3-1', 30, null),
  (null, 'RINON|STONE', 'Stone Disolver', 30, null),
  ('TIENDA_GT', 'CAND', 'Candela Cream', 30, null),
  (null, 'JOINT|CURCUMA', 'Funrich Cúrcuma', 30, null),
  (null, 'OFTAL|MIEL', 'Oftalmiel', 30, null),
  (null, 'ZOO|ZONE', 'Zoone', 30, null),
  (null, 'CLOR', 'Clorofila', 30, null),
  (null, 'MULLEIN', 'Mullein', 30, null),
  (null, 'BEEVANA', 'Beevana', 30, null),
  (null, 'NIPPORI|SHAMPOO', 'Nippori Shampoo', 30, null),
  (null, 'AIRI|DEBLOAT', 'Airi Debloat', 30, null),
  ('TIENDA_GT', '(^|[^A-Z])MAL', 'Breatyfresh', 30, 'Las que empiezan con MAL (MAL02, MAL05, MALCBO…)'),
  (null, 'DRE|LINF|VENTCBO|INTERCBO|OJOOOO|VIDEO ?G|TRAFABO|LANDING04|SUELTACBO|INTERABO|INTERVIDEO|VENTASCBO|VENTASVIDEO', 'Drenaje Linfático', 90, null);

create or replace function public.prod_de_campana(p_cuenta text, p_campana text) returns text
language sql stable set search_path = '' as $$
  select coalesce(
    (select a.producto from public.prod_campana_asignada a where a.cuenta = p_cuenta and a.campana = p_campana),
    (select r.producto from public.prod_campana_reglas r
     where (r.cuenta is null or r.cuenta = p_cuenta) and public.prod_clave(p_campana) ~ r.patron
     order by r.prioridad, r.id limit 1));
$$;

create or replace function public.prod_nombre(p_cuenta text, p_nombre text) returns text
language sql stable set search_path = '' as $$
  select coalesce(
    (select a.producto from public.prod_alias a
     where (a.cuenta is null or a.cuenta = p_cuenta) and public.prod_clave(p_nombre) ~ a.patron
     order by a.prioridad, a.id limit 1),
    nullif(initcap(lower(btrim(p_nombre))), ''), 'Sin producto');
$$;

-- Datos del menú para una tienda y un rango (día = creación de la guía/orden, hora local).
--   econ: [día, producto, entregadas, devueltas, pendientes, venta, costo, flete, fulfillment, 4x1000, flete dev.]
--         (montos de la wallet de Effi y de la cartera de Dropi; una guía de varios productos se reparte por unidades)
--   estados: [día, producto, estado, plataforma, proveedor, guías]   ads: [día, producto, COP]
--   sin: [día, cuenta publicitaria, campaña, COP]   ads_dia: [día, COP gastado por las cuentas]
--   meses: {mes: {factor COP→local, gastos del mes, entregas del mes}}
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
      select m[2] as nombre, greatest(m[1]::numeric, 1) as cant
      from regexp_matches(coalesce(g.contenido, ''), '(\d+)\s*\*\s*([^.]+)\.', 'g') m) i on true
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

-- Homologación: campañas con gasto en el rango, con su producto y de dónde sale (manual o regla).
create or replace function public.prod_campanas(p_cuenta text, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('resumen')) as ok),
  c as (
    select c.campana, string_agg(distinct c.cuenta_ads, ', ') as cuentas, sum(c.monto_cop) as cop,
      count(distinct c.fecha) as dias, min(c.fecha) as desde, max(c.fecha) as hasta
    from public.app_publicidad_campanas c
    where c.cuenta = p_cuenta and (select ok from permitido) and c.fecha between p_desde and p_hasta
    group by 1
  )
  select jsonb_build_object(
    'campanas', coalesce((select jsonb_agg(jsonb_build_object('campana', c.campana, 'cuentas', c.cuentas, 'cop', round(c.cop),
        'dias', c.dias, 'desde', c.desde, 'hasta', c.hasta,
        'manual', a.producto, 'asignado_por', a.asignado_por,
        'regla', r.producto, 'patron', r.patron) order by c.cop desc)
      from c
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

-- Asignar (o quitar, con producto vacío) el producto de una campaña. Solo dueño o socio que vea la tienda.
create or replace function public.prod_asignar_campana(p_cuenta text, p_campana text, p_producto text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (p_cuenta = any (public.app_cuentas_visibles('resumen'))
          and exists (select 1 from public.app_usuarios u where u.user_id = (select auth.uid()) and u.activo and u.rol in ('owner', 'socio'))) then
    raise exception 'Sin permiso para homologar campañas de esta tienda';
  end if;
  if nullif(btrim(coalesce(p_producto, '')), '') is null then
    delete from public.prod_campana_asignada where cuenta = p_cuenta and campana = p_campana;
  else
    insert into public.prod_campana_asignada (cuenta, campana, producto, asignado_por)
    values (p_cuenta, p_campana, btrim(p_producto),
            (select u.email from public.app_usuarios u where u.user_id = (select auth.uid())))
    on conflict (cuenta, campana) do update set producto = excluded.producto, asignado_por = excluded.asignado_por, asignado_en = now();
  end if;
end $$;

revoke all on function public.productos_datos(text, date, date) from public, anon;
revoke all on function public.prod_campanas(text, date, date) from public, anon;
revoke all on function public.prod_asignar_campana(text, text, text) from public, anon;
grant execute on function public.productos_datos(text, date, date) to authenticated;
grant execute on function public.prod_campanas(text, date, date) to authenticated;
grant execute on function public.prod_asignar_campana(text, text, text) to authenticated;
