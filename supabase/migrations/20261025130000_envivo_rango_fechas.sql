-- En vivo con calendario: además de los últimos N minutos, un rango de días (hoy, ayer o lo que se elija). Cada día se
-- cuenta en la hora local de cada país (desde su medianoche). Con p_desde/p_hasta se ignora p_minutos.
drop function if exists public.envivo_pulso(text[], integer);
create or replace function public.envivo_pulso(p_cuentas text[] default null, p_minutos integer default 60,
  p_desde date default null, p_hasta date default null)
returns jsonb language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with par as (select p_minutos <= 0 as hoy, greatest(1, least(p_minutos, 1440)) as m, p_desde is not null as rango),
  c0 as (
    select a.slug, a.tz_offset_min,
      (((now() + make_interval(mins => a.tz_offset_min))::date)::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz as inicio
    from public.effi_accounts a
    where a.tipo = 'tienda' and a.activa
      and a.slug = any (public.app_cuentas_visibles())
      and (p_cuentas is null or a.slug = any (p_cuentas))
  ),
  c1 as (
    select c0.*,
      case when (select rango from par) then (p_desde::timestamp - make_interval(mins => c0.tz_offset_min))::timestamptz
           when (select hoy from par) then c0.inicio
           else now() - make_interval(mins => (select m from par)) end as desde,
      case when (select rango from par)
           then least(now(), ((coalesce(p_hasta, p_desde) + 1)::timestamp - make_interval(mins => c0.tz_offset_min))::timestamptz)
           else now() end as hasta
    from c0
  ),
  c as (select c1.*, greatest(1, extract(epoch from c1.hasta - c1.desde)) as seg from c1),
  ev as (
    select e.cuenta, e.fecha_hist_est,
      case e.est_guia_new_efficommerce
        when 4 then 'ENTREGADO' when 5 then 'DEVOLUCION' when 2 then 'EN_TRANSITO' when 8 then 'EN_TRANSITO'
        when 3 then 'NOVEDAD' when 9 then 'EN_OFICINA' else 'OTRO' end as cat
    from public.effi_guia_estados e
    join c on c.slug = e.cuenta
    where e.fecha_hist_est >= least(c.inicio, c.desde)
  ),
  -- Etapas previas a la guía: órdenes, remisiones y guías generadas (con su fecha de creación).
  pr as (
    select o.cuenta, 'ORDEN' as etapa, o.fecha_orden as fecha from public.auto_ordenes o join c on c.slug = o.cuenta
      where o.fecha_orden >= least(c.inicio, c.desde)
    union all
    select o.cuenta, 'REMISION', o.rem_fecha from public.auto_ordenes o join c on c.slug = o.cuenta
      where o.rem_fecha >= least(c.inicio, c.desde) and o.rem_vigente is not false
    union all
    select g.cuenta, 'GENERADA', g.fecha_trans from public.effi_guias g join c on c.slug = g.cuenta
      where g.fecha_trans >= least(c.inicio, c.desde) and g.vigente is not false
  ),
  pago as (
    select w.cuenta, count(*) as n, sum(w.valor) as total
    from public.effi_wallet w join c on c.slug = w.cuenta
    where w.t_movimiento = 1 and w.vigente is not false and w.fecha_trans >= c.inicio
    group by 1
  )
  select jsonb_build_object(
    'ahora', now(),
    'hoy', (select hoy from par),
    'rango', (select rango from par),
    'minutos', greatest(1, ceil((select max(seg) from c) / 60))::int,
    'cuentas', coalesce(jsonb_agg(jsonb_build_object(
      'cuenta', c.slug,
      'agente', exists (select 1 from public.auto_config x where x.cuenta = c.slug),
      'hoy', (select coalesce(jsonb_object_agg(cat, n), '{}'::jsonb) from (select cat, count(*) n from ev where ev.cuenta = c.slug and ev.fecha_hist_est >= c.inicio group by 1) x),
      'ventana', (select coalesce(jsonb_object_agg(cat, n), '{}'::jsonb) from (select cat, count(*) n from ev where ev.cuenta = c.slug and ev.fecha_hist_est >= c.desde and ev.fecha_hist_est < c.hasta + interval '1 second' group by 1) x),
      'proceso_hoy', (select coalesce(jsonb_object_agg(etapa, n), '{}'::jsonb) from (select etapa, count(*) n from pr where pr.cuenta = c.slug and pr.fecha >= c.inicio group by 1) x),
      'proceso_ventana', (select coalesce(jsonb_object_agg(etapa, n), '{}'::jsonb) from (select etapa, count(*) n from pr where pr.cuenta = c.slug and pr.fecha >= c.desde and pr.fecha < c.hasta + interval '1 second' group by 1) x),
      -- 60 cortes iguales entre "desde" y "hasta" (el último es el más reciente).
      'serie', (select jsonb_agg(coalesce(s.n, 0) order by g.i desc) from generate_series(0, 59) g(i)
                left join (select least(59, floor(extract(epoch from c.hasta - fecha_hist_est) / (c.seg / 60)))::int as i, count(*) n
                           from ev where ev.cuenta = c.slug and ev.fecha_hist_est >= c.desde and ev.fecha_hist_est < c.hasta + interval '1 second' group by 1) s using (i)),
      'recaudo_hoy', coalesce((select total from pago where pago.cuenta = c.slug), 0),
      'pagos_hoy', coalesce((select n from pago where pago.cuenta = c.slug), 0),
      'ultimo', (select max(fecha_hist_est) from ev where ev.cuenta = c.slug)
    ) order by c.slug), '[]'::jsonb)
  )
  from c;
$$;
revoke all on function public.envivo_pulso(text[], integer, date, date) from public, anon;
grant execute on function public.envivo_pulso(text[], integer, date, date) to authenticated, service_role;
