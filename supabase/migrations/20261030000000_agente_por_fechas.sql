-- Agente con calendario (30-oct): pasada la medianoche ya no se veía lo que hizo el sistema el día anterior. auto_lista
-- y auto_fabrica reciben un rango de días (hora local del país); sin rango siguen igual que antes (hoy, en vivo).

-- auto_lista: con p_desde trae las órdenes de esos días (en vez de las de los últimos p_dias) y los conteos "hoy_*"
-- pasan a ser del periodo.
do $$
declare d text := pg_get_functiondef('public.auto_lista(text,integer)'::regprocedure);
begin
  d := replace(d, 'public.auto_lista(p_cuenta text, p_dias integer DEFAULT 3)',
    'public.auto_lista(p_cuenta text, p_dias integer DEFAULT 3, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)');
  d := replace(d, $q$tz as (select tz_offset_min from public.effi_accounts where slug = p_cuenta),$q$,
    $q$tz as (select tz_offset_min from public.effi_accounts where slug = p_cuenta),
  rango as (
    select coalesce(p_desde, (now() + make_interval(mins => tz_offset_min))::date) as d1,
           coalesce(p_hasta, p_desde, (now() + make_interval(mins => tz_offset_min))::date) as d2
    from tz
  ),
  periodo as (
    select x.* from public.auto_ordenes x
    where x.cuenta = p_cuenta and (select ok from permitido)
      and (x.fecha_orden + make_interval(mins => (select tz_offset_min from tz)))::date between (select d1 from rango) and (select d2 from rango)
  ),$q$);
  d := replace(d, $q$and a.fecha_orden >= now() - make_interval(days => greatest(1, least(p_dias, 30)))$q$,
    $q$and case when p_desde is null then a.fecha_orden >= now() - make_interval(days => greatest(1, least(p_dias, 30)))
          else (a.fecha_orden + make_interval(mins => (select tz_offset_min from tz)))::date between (select d1 from rango) and (select d2 from rango) end$q$);
  d := replace(d, $q$from mes where dia = (now() + make_interval(mins => (select tz_offset_min from tz)))::date$q$, 'from periodo where true');
  if position('periodo where true' in d) = 0 or position('p_desde date' in d) = 0 or position('else (a.fecha_orden' in d) = 0 then
    raise exception 'auto_lista cambió: no se pudo agregar el rango';
  end if;
  drop function public.auto_lista(text, integer);
  execute d;
end $$;
revoke all on function public.auto_lista(text, integer, date, date) from public, anon;
grant execute on function public.auto_lista(text, integer, date, date) to authenticated;

-- auto_fabrica: Agente en vivo del periodo (por defecto hoy).
drop function if exists public.auto_fabrica(text);
create or replace function public.auto_fabrica(p_cuenta text, p_desde date default null, p_hasta date default null)
returns jsonb language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('automatizacion')) as ok),
  a as (
    select coalesce(p_desde, (now() + make_interval(mins => tz_offset_min))::date)::timestamp - make_interval(mins => tz_offset_min) as ini,
           (coalesce(p_hasta, p_desde, (now() + make_interval(mins => tz_offset_min))::date) + 1)::timestamp - make_interval(mins => tz_offset_min) as fin
    from public.effi_accounts where slug = p_cuenta
  ),
  ev as (
    select e.id_orden,
      bool_or(e.paso = 'remision' and e.mensaje like 'Remisión % creada%') as rem_agente,
      bool_or(e.paso = 'guia' and e.mensaje like 'Guía % creada%') as guia_agente
    from public.auto_eventos e, a
    where e.cuenta = p_cuenta and e.ok and e.creado_en >= a.ini - interval '4 days' and e.creado_en < a.fin + interval '2 days'
      and e.id_orden is not null
    group by 1
  ),
  o as (
    select x.*, coalesce(ev.rem_agente, false) as rem_agente, coalesce(ev.guia_agente, false) as guia_agente,
      g.fecha_trans as guia_fecha
    from public.auto_ordenes x
    left join ev on ev.id_orden = x.id
    left join public.effi_guias g on g.cuenta = x.cuenta and g.id = x.id_guia
    where x.cuenta = p_cuenta and (select ok from permitido)
      and x.fecha_orden >= (select ini from a) - interval '3 days' and x.fecha_orden < (select fin from a)
  )
  select jsonb_build_object(
    'ordenes_hoy', count(*) filter (where fecha_orden >= (select ini from a) and not (orden_vigente is false and id_remision is null)),
    'anuladas_hoy', count(*) filter (where fecha_orden >= (select ini from a) and orden_vigente is false and id_remision is null),
    'sin_remision', count(*) filter (where orden_vigente is not false and id_remision is null),
    'rem_agente', count(*) filter (where rem_fecha >= (select ini from a) and rem_fecha < (select fin from a) and rem_vigente is not false and rem_agente),
    'rem_humano', count(*) filter (where rem_fecha >= (select ini from a) and rem_fecha < (select fin from a) and rem_vigente is not false and not rem_agente),
    'sin_guia_agente', count(*) filter (where id_remision is not null and rem_vigente is not false and guia is null and rem_agente),
    'sin_guia_humano', count(*) filter (where id_remision is not null and rem_vigente is not false and guia is null and not rem_agente),
    'guia_aa', count(*) filter (where guia_fecha >= (select ini from a) and guia_fecha < (select fin from a) and rem_agente and guia_agente),
    'guia_ah', count(*) filter (where guia_fecha >= (select ini from a) and guia_fecha < (select fin from a) and rem_agente and not guia_agente),
    'guia_ha', count(*) filter (where guia_fecha >= (select ini from a) and guia_fecha < (select fin from a) and not rem_agente and guia_agente),
    'guia_hh', count(*) filter (where guia_fecha >= (select ini from a) and guia_fecha < (select fin from a) and not rem_agente and not guia_agente)
  )
  from o;
$$;
revoke all on function public.auto_fabrica(text, date, date) from public, anon;
grant execute on function public.auto_fabrica(text, date, date) to authenticated;
