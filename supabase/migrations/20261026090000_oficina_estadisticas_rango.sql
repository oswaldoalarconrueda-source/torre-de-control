-- Estadísticas de Disponible en oficina con calendario: además de los últimos N días, un rango de días (hoy, ayer, los
-- últimos 7, el mes...). Cada día en la hora local del país. Sin p_desde/p_hasta funciona igual que antes (p_dias).
drop function if exists public.oficina_estadisticas(text, integer);
create or replace function public.oficina_estadisticas(p_cuenta text, p_dias integer default 14, p_desde date default null, p_hasta date default null)
returns jsonb language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $function$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('oficina')) as ok),
  tz as (select make_interval(mins => tz_offset_min) as off from public.effi_accounts where slug = p_cuenta),
  hoy as (select (now() + (select off from tz))::date as dia),
  hasta as (select least(coalesce(p_hasta, (select dia from hoy)), (select dia from hoy)) as dia),
  desde as (select least(coalesce(p_desde, (select dia from hoy) - (greatest(1, least(p_dias, 60)) - 1)), (select dia from hasta)) as dia),
  llegadas as (
    select e.cuenta, e.empresa, e.sucursal, e.id_guia, min(e.fecha_hist_est) as llegada
    from public.effi_guia_estados e
    where e.cuenta = p_cuenta and (select ok from permitido) and e.est_guia_new_efficommerce = 9
      and e.fecha_hist_est >= ((select dia from desde)::timestamp - (select off from tz))::timestamptz - interval '1 day'
    group by 1, 2, 3, 4
  ),
  guias as (
    select g.guia, (l.llegada + (select off from tz))::date as dia,
      case when g.fecha_recaudo is not null or g.est_guia_efficommerce = 4 then 'entregada'
           when g.est_guia_efficommerce = 5 then 'devuelta'
           when g.est_guia_efficommerce = 9 then 'en_oficina' else 'otra' end as fin,
      exists (select 1 from public.oficina_llamadas c where c.cuenta = p_cuenta and c.guia = g.guia) as llamada
    from llegadas l
    join public.effi_guias g on g.cuenta = l.cuenta and g.empresa = l.empresa and g.sucursal = l.sucursal and g.id = l.id_guia
    where (l.llegada + (select off from tz))::date between (select dia from desde) and (select dia from hasta)
  ),
  llamadas as (
    select c.*, (c.creado_en + (select off from tz)) as local,
      case when g.fecha_recaudo is not null or g.est_guia_efficommerce = 4 then 'entregada'
           when g.est_guia_efficommerce = 5 then 'devuelta' else 'abierta' end as fin
    from public.oficina_llamadas c
    left join public.effi_guias g on g.cuenta = c.cuenta and g.guia = c.guia
    where c.cuenta = p_cuenta and (select ok from permitido)
      and (c.creado_en + (select off from tz))::date between (select dia from desde) and (select dia from hasta)
  ),
  obs as (
    select o.codigo, o.fecha_compromiso,
      case when g.fecha_recaudo is not null or g.est_guia_efficommerce = 4 then 'entregada'
           when g.est_guia_efficommerce = 5 then 'devuelta'
           when g.est_guia_efficommerce = 9 then 'en_oficina' else 'otra' end as fin,
      (coalesce(g.fecha_entrega, g.fecha_recaudo) + (select off from tz))::date as entregada_dia
    from public.oficina_observaciones o
    join public.effi_guias g on g.cuenta = o.cuenta and g.guia = o.guia
    where o.cuenta = p_cuenta and (select ok from permitido) and o.codigo is not null
      and (o.actualizado_en + (select off from tz))::date between (select dia from desde) and (select dia from hasta)
  ),
  dias as (select generate_series((select dia from desde), (select dia from hasta), interval '1 day')::date as dia)
  select jsonb_build_object(
    'desde', (select dia from desde), 'hasta', (select dia from hasta),
    'dias', (select jsonb_agg(jsonb_build_object(
        'dia', d.dia,
        'llegaron', (select count(*) from guias where guias.dia = d.dia),
        'llamadas', (select count(*) from llamadas where llamadas.local::date = d.dia),
        'guias_llamadas', (select count(distinct guia) from llamadas where llamadas.local::date = d.dia),
        'contesto', (select count(*) from llamadas where llamadas.local::date = d.dia and resultado = 'contesto'),
        'no_contesto', (select count(*) from llamadas where llamadas.local::date = d.dia and resultado = 'no_contesto'),
        'telefono_malo', (select count(*) from llamadas where llamadas.local::date = d.dia and resultado = 'telefono_malo'),
        'entregadas', (select count(*) from guias where guias.dia = d.dia and fin = 'entregada'),
        'devueltas', (select count(*) from guias where guias.dia = d.dia and fin = 'devuelta'),
        'en_oficina', (select count(*) from guias where guias.dia = d.dia and fin = 'en_oficina'),
        'llamadas_entregadas', (select count(*) from guias where guias.dia = d.dia and llamada and fin = 'entregada'),
        'llamadas_total', (select count(*) from guias where guias.dia = d.dia and llamada),
        'sin_llamar_entregadas', (select count(*) from guias where guias.dia = d.dia and not llamada and fin = 'entregada'),
        'sin_llamar_total', (select count(*) from guias where guias.dia = d.dia and not llamada)
      ) order by d.dia desc) from dias d),
    'horas', coalesce((select jsonb_agg(h order by h.hora) from (
        select extract(hour from local)::int as hora, count(*) as llamadas,
          count(*) filter (where resultado = 'contesto') as contesto,
          count(distinct guia) filter (where fin = 'entregada') as entregadas,
          count(distinct guia) as guias
        from llamadas group by 1) h), '[]'::jsonb),
    'observaciones', coalesce((select jsonb_agg(o order by o.guias desc) from (
        select codigo, count(*) as guias,
          count(*) filter (where fin = 'entregada') as entregadas,
          count(*) filter (where fin = 'devuelta') as devueltas,
          count(*) filter (where fin = 'en_oficina') as en_oficina,
          count(*) filter (where fecha_compromiso is not null) as con_fecha,
          count(*) filter (where fecha_compromiso is not null and fin = 'entregada' and entregada_dia <= fecha_compromiso + 1) as cumplieron
        from obs group by 1) o), '[]'::jsonb),
    'intentos', coalesce((select jsonb_agg(i order by i.intento) from (
        select least(intento, 4) as intento, count(*) as llamadas,
          count(*) filter (where resultado = 'contesto') as contesto,
          count(distinct guia) filter (where fin = 'entregada') as entregadas,
          count(distinct guia) as guias
        from llamadas group by 1) i), '[]'::jsonb)
  );
$function$;
revoke all on function public.oficina_estadisticas(text, integer, date, date) from public, anon;
grant execute on function public.oficina_estadisticas(text, integer, date, date) to authenticated;
