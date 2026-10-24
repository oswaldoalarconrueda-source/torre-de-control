-- ⚡ En vivo con ventana de tiempo (1 min a 24 h): conteos por estado en la ventana, serie de 60 cortes
-- iguales dentro de la ventana (el "latido"), lo de hoy (día local) y el recaudo acreditado hoy.

drop function public.envivo_pulso(text[]);
create function public.envivo_pulso(p_cuentas text[] default null, p_minutos integer default 60) returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with par as (select greatest(1, least(p_minutos, 1440)) as m),
  c as (
    select a.slug,
      (((now() + make_interval(mins => a.tz_offset_min))::date)::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz as inicio
    from public.effi_accounts a
    where a.tipo = 'tienda' and a.activa
      and a.slug = any (public.app_cuentas_visibles())
      and (p_cuentas is null or a.slug = any (p_cuentas))
  ),
  ev as (
    select e.cuenta, e.fecha_hist_est,
      case e.est_guia_new_efficommerce
        when 4 then 'ENTREGADO' when 5 then 'DEVOLUCION' when 2 then 'EN_TRANSITO' when 8 then 'EN_TRANSITO'
        when 3 then 'NOVEDAD' when 9 then 'EN_OFICINA' else 'OTRO' end as cat
    from public.effi_guia_estados e
    join c on c.slug = e.cuenta
    where e.fecha_hist_est >= least(c.inicio, now() - make_interval(mins => (select m from par)))
  ),
  pago as (
    select w.cuenta, count(*) as n, sum(w.valor) as total
    from public.effi_wallet w join c on c.slug = w.cuenta
    where w.t_movimiento = 1 and w.vigente is not false and w.fecha_trans >= c.inicio
    group by 1
  )
  select jsonb_build_object(
    'ahora', now(),
    'minutos', (select m from par),
    'cuentas', coalesce(jsonb_agg(jsonb_build_object(
      'cuenta', c.slug,
      'hoy', (select coalesce(jsonb_object_agg(cat, n), '{}'::jsonb) from (select cat, count(*) n from ev where ev.cuenta = c.slug and ev.fecha_hist_est >= c.inicio group by 1) x),
      'ventana', (select coalesce(jsonb_object_agg(cat, n), '{}'::jsonb) from (select cat, count(*) n from ev where ev.cuenta = c.slug and ev.fecha_hist_est >= now() - make_interval(mins => (select m from par)) group by 1) x),
      -- 60 cortes iguales; el último es el más reciente
      'serie', (select jsonb_agg(coalesce(s.n, 0) order by g.i desc) from generate_series(0, 59) g(i)
                left join (select floor(extract(epoch from now() - fecha_hist_est) / ((select m from par) * 60.0 / 60))::int as i, count(*) n
                           from ev where ev.cuenta = c.slug and ev.fecha_hist_est >= now() - make_interval(mins => (select m from par)) group by 1) s using (i)),
      'recaudo_hoy', coalesce((select total from pago where pago.cuenta = c.slug), 0),
      'pagos_hoy', coalesce((select n from pago where pago.cuenta = c.slug), 0),
      'ultimo', (select max(fecha_hist_est) from ev where ev.cuenta = c.slug)
    ) order by c.slug), '[]'::jsonb)
  )
  from c;
$$;
revoke all on function public.envivo_pulso(text[], integer) from public, anon;
grant execute on function public.envivo_pulso(text[], integer) to authenticated;
