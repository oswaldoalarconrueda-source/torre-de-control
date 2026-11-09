-- ⚡ Homologar campañas tardaba ~10 s en Ecuador y Colombia: la lista de "Elegir producto" leía y nombraba cada guía
-- (29 mil) una por una. Ahora agrupa por contenido de guía (pocas decenas distintos), lee cada uno una vez y suma las
-- guías: mismo resultado (cada guía cuenta una vez por producto), en una fracción de segundo.
-- También prod_campanas calcula los países de entrega de una sola pasada en vez de una consulta por campaña.
create or replace function public.prod_productos_historicos(p_cuenta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('resumen')) as ok),
  contenidos as (
    select g.contenido, count(*) as guias
    from public.effi_guias g
    where g.cuenta = p_cuenta and g.vigente is not false and (select ok from permitido)
    group by 1
  ),
  lineas as (
    select c.contenido, c.guias, l.nombre
    from contenidos c, public.prod_lineas(c.contenido) l
    where not public.prod_es_cargo(l.nombre)
  ),
  nombres as (select n.nombre, public.prod_nombre(p_cuenta, n.nombre) as producto from (select distinct nombre from lineas) n),
  effi as (  -- cada contenido suma sus guías una vez por producto, aunque traiga dos nombres del mismo producto
    select x.producto, sum(x.guias) as guias
    from (select distinct l.contenido, l.guias, nm.producto from lineas l join nombres nm using (nombre)) x
    group by 1
  ),
  dropi as (
    select public.prod_nombre(p_cuenta, x.producto) as producto, count(distinct x.orden_id) as guias
    from (select distinct p.orden_id, p.producto from public.dropi_orden_productos p
          where p.cuenta = p_cuenta and (select ok from permitido)) x
    group by 1
  ),
  v as (select producto, sum(guias)::numeric as guias from (select * from effi union all select * from dropi) t group by 1),
  -- Primero las campañas distintas (materializado): si no, Postgres calcula el producto en cada fila diaria (11 mil).
  campanas as materialized (
    select distinct campana from public.app_publicidad_campanas where cuenta = p_cuenta and (select ok from permitido)
  ),
  pautados as materialized (
    select producto from public.prod_campana_asignada where cuenta = p_cuenta and (select ok from permitido)
    union
    select public.prod_de_campana(p_cuenta, c.campana) from campanas c
  ),
  a as (select distinct producto, 0::numeric as guias from pautados
        where producto is not null and producto <> '' and producto not in (select producto from v))
  select coalesce(jsonb_agg(jsonb_build_object('producto', producto, 'guias', guias) order by guias desc, producto), '[]'::jsonb)
  from (select * from v union all select * from a) x;
$$;
revoke all on function public.prod_productos_historicos(text) from public, anon;
grant execute on function public.prod_productos_historicos(text) to authenticated;

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
    where x.cuenta = p_cuenta and (select ok from permitido)
    group by 1
  ),
  -- Países de entrega distintos al de la tienda, de una sola pasada (antes era una consulta por campaña).
  o as (
    select x.campana, string_agg(distinct t, ',' order by t) as paises
    from public.app_publicidad_campanas x, unnest(string_to_array(x.pais, ',')) t
    where x.cuenta = p_cuenta and (select ok from permitido) and x.fecha between p_desde and p_hasta
      and t <> (select a.pais from public.effi_accounts a where a.slug = p_cuenta)
    group by 1
  )
  select jsonb_build_object(
    'campanas', coalesce((select jsonb_agg(jsonb_build_object('campana', c.campana, 'cuentas', c.cuentas, 'cop', round(c.cop),
        'dias', c.dias, 'desde', c.desde, 'hasta', c.hasta,
        'primer_gasto', h.primer_gasto, 'ultimo_gasto', h.ultimo_gasto,
        'creada', (m.creada at time zone 'America/Bogota')::date, 'inicio', (m.inicio at time zone 'America/Bogota')::date,
        'fin', (m.fin at time zone 'America/Bogota')::date, 'estado', m.estado,
        'otros_paises', o.paises,
        'manual', a.producto, 'asignado_por', a.asignado_por,
        'regla', r.producto, 'patron', r.patron) order by c.cop desc)
      from c
      left join h on h.campana = c.campana
      left join o on o.campana = c.campana
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
