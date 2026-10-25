-- 🏤 Disponible en oficina · cuadre diario y resultado por día de llegada.
--
-- Cuadre (la oficina como inventario), por día local: inicio + llegaron − retiradas − a devolución − volvieron a
-- otro estado = cierre. Sale del historial de estados de Effi: cada paso A estado 9 (Disponible en oficina) es una
-- llegada y cada paso DESDE el 9 es una salida (a 4 Entregada = retirada, a 5 Devolución, o a otro estado: casi
-- siempre vuelve a tránsito camino a devolución). El cierre de hoy coincide con la lista del CRM.
--
-- Resultado por día de llegada: de las guías que llegaron por primera vez a oficina cada día, en qué están hoy,
-- separando las contactadas (al menos un "Contactado" en el CRM) de las que no.

create function public.oficina_cuadre(p_cuenta text, p_dias integer default 14) returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('oficina')) as ok),
  tz as (select make_interval(mins => tz_offset_min) as off from public.effi_accounts where slug = p_cuenta),
  hoy as (select (now() + (select off from tz))::date as dia),
  desde as (select (select dia from hoy) - (greatest(1, least(p_dias, 60)) - 1) as dia),
  h as (
    select e.empresa, e.sucursal, e.id_guia, e.est_guia_new_efficommerce as est,
      lag(e.est_guia_new_efficommerce) over (partition by e.empresa, e.sucursal, e.id_guia order by e.fecha_hist_est) as prev,
      (e.fecha_hist_est + (select off from tz))::date as dia
    from public.effi_guia_estados e
    where e.cuenta = p_cuenta and (select ok from permitido)
  ),
  mov as (
    select dia,
      count(*) filter (where est = 9 and prev is distinct from 9) as llegaron,
      count(*) filter (where prev = 9 and est = 4) as retiradas,
      count(*) filter (where prev = 9 and est = 5) as devolucion,
      count(*) filter (where prev = 9 and est is distinct from 9 and est not in (4, 5)) as otro
    from h group by dia
  ),
  dias as (select generate_series((select dia from desde), (select dia from hoy), interval '1 day')::date as dia),
  cuadre as (
    select d.dia,
      coalesce(m.llegaron, 0) as llegaron, coalesce(m.retiradas, 0) as retiradas,
      coalesce(m.devolucion, 0) as devolucion, coalesce(m.otro, 0) as otro,
      (select coalesce(sum(x.llegaron - x.retiradas - x.devolucion - x.otro), 0) from mov x where x.dia <= d.dia) as cierre
    from dias d left join mov m using (dia)
  ),
  -- Primera llegada a oficina de cada guía dentro del rango.
  llegadas as (
    select e.empresa, e.sucursal, e.id_guia, min(e.fecha_hist_est) as llegada
    from public.effi_guia_estados e
    where e.cuenta = p_cuenta and (select ok from permitido) and e.est_guia_new_efficommerce = 9
      and e.fecha_hist_est >= ((select dia from desde)::timestamp - (select off from tz))::timestamptz - interval '1 day'
    group by 1, 2, 3
  ),
  cohorte as (
    select (l.llegada + (select off from tz))::date as dia,
      case when g.fecha_recaudo is not null or g.est_guia_efficommerce = 4 then 'retirada'
           when g.est_guia_efficommerce = 5 then 'devuelta'
           when g.est_guia_efficommerce = 9 then 'oficina' else 'otro' end as fin,
      exists (select 1 from public.oficina_llamadas c where c.cuenta = p_cuenta and c.guia = g.guia and c.resultado = 'contesto') as contactada
    from llegadas l
    join public.effi_guias g on g.cuenta = p_cuenta and g.empresa = l.empresa and g.sucursal = l.sucursal and g.id = l.id_guia
    where (l.llegada + (select off from tz))::date >= (select dia from desde)
  )
  select jsonb_build_object(
    'cuadre', coalesce((select jsonb_agg(jsonb_build_object(
        'dia', c.dia, 'inicio', c.cierre - c.llegaron + c.retiradas + c.devolucion + c.otro,
        'llegaron', c.llegaron, 'retiradas', c.retiradas, 'devolucion', c.devolucion, 'otro', c.otro, 'cierre', c.cierre
      ) order by c.dia desc) from cuadre c), '[]'::jsonb),
    'llegadas', coalesce((select jsonb_agg(x order by x.dia desc) from (
        select dia, count(*) as llegaron,
          count(*) filter (where fin = 'retirada') as retiradas,
          count(*) filter (where fin = 'devuelta') as devueltas,
          count(*) filter (where fin = 'oficina') as en_oficina,
          count(*) filter (where fin = 'otro') as otro,
          count(*) filter (where contactada) as contactadas,
          count(*) filter (where contactada and fin = 'retirada') as contactadas_retiradas,
          count(*) filter (where not contactada) as sin_contactar,
          count(*) filter (where not contactada and fin = 'retirada') as sin_contactar_retiradas
        from cohorte group by dia) x), '[]'::jsonb)
  );
$$;
revoke all on function public.oficina_cuadre(text, integer) from public, anon;
grant execute on function public.oficina_cuadre(text, integer) to authenticated;
