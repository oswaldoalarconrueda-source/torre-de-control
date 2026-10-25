-- 🗺️ En vivo por departamento: al entrar al mapa de un país, cada departamento muestra sus órdenes, remisiones, guías
-- generadas y los estados de las guías (en tránsito, en oficina, novedad, entregada, devolución), con el mismo filtro
-- de tiempo de En vivo (últimos minutos o días del calendario, en la hora local del país).
create or replace function public.envivo_mapa(p_cuenta text, p_minutos integer default 60, p_desde date default null, p_hasta date default null)
returns jsonb language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with c as (
    select a.slug,
      case when p_desde is not null then (p_desde::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz
           else now() - make_interval(mins => greatest(1, least(p_minutos, 1440))) end as desde,
      case when p_desde is not null
           then least(now(), ((coalesce(p_hasta, p_desde) + 1)::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz)
           else now() end as hasta
    from public.effi_accounts a
    where a.slug = p_cuenta and a.slug = any (public.app_cuentas_visibles())
  ),
  ev as (
    select coalesce(g.nombre_provincia_destinatario, '—') as prov,
      case e.est_guia_new_efficommerce
        when 4 then 'ENTREGADO' when 5 then 'DEVOLUCION' when 2 then 'EN_TRANSITO' when 8 then 'EN_TRANSITO'
        when 3 then 'NOVEDAD' when 9 then 'EN_OFICINA' end as cat
    from public.effi_guia_estados e
    join c on c.slug = e.cuenta
    left join public.effi_guias g on g.cuenta = e.cuenta and g.empresa = e.empresa and g.sucursal = e.sucursal and g.id = e.id_guia
    where e.fecha_hist_est >= c.desde and e.fecha_hist_est < c.hasta + interval '1 second'
  ),
  pr as (
    select coalesce(o.provincia, '—') as prov, 'ORDEN' as cat from public.auto_ordenes o join c on c.slug = o.cuenta
      where o.fecha_orden >= c.desde and o.fecha_orden < c.hasta + interval '1 second'
    union all
    select coalesce(o.provincia, '—'), 'REMISION' from public.auto_ordenes o join c on c.slug = o.cuenta
      where o.rem_fecha >= c.desde and o.rem_fecha < c.hasta + interval '1 second' and o.rem_vigente is not false
    union all
    select coalesce(g.nombre_provincia_destinatario, '—'), 'GENERADA' from public.effi_guias g join c on c.slug = g.cuenta
      where g.fecha_trans >= c.desde and g.fecha_trans < c.hasta + interval '1 second' and g.vigente is not false
  ),
  todo as (select prov, cat from ev where cat is not null union all select prov, cat from pr)
  select jsonb_build_object(
    'cuenta', p_cuenta,
    'provincias', coalesce((select jsonb_object_agg(prov, cats) from (
      select prov, jsonb_object_agg(cat, n) as cats from (select prov, cat, count(*) n from todo group by 1, 2) x group by prov) y), '{}'::jsonb)
  )
  from c;
$$;
revoke all on function public.envivo_mapa(text, integer, date, date) from public, anon;
grant execute on function public.envivo_mapa(text, integer, date, date) to authenticated, service_role;
