-- 🏭 Fábrica del agente (pedido del dueño, 28-oct): cuánto hizo hoy el Agente y cuánto una persona (Humano) en cada
-- etapa: orden → remisión → guía. Effi pone el mismo responsable en todo (el usuario de la API), así que quién lo hizo
-- sale de la bitácora del agente (auto_eventos): si el agente creó la remisión o la guía, es "Agente"; si no, "Humano".
create or replace function public.auto_fabrica(p_cuenta text)
returns jsonb language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('automatizacion')) as ok),
  a as (
    select ((now() + make_interval(mins => tz_offset_min))::date)::timestamp - make_interval(mins => tz_offset_min) as ini
    from public.effi_accounts where slug = p_cuenta
  ),
  ev as (
    select e.id_orden,
      bool_or(e.paso = 'remision' and e.mensaje like 'Remisión % creada%') as rem_agente,
      bool_or(e.paso = 'guia' and e.mensaje like 'Guía % creada%') as guia_agente
    from public.auto_eventos e, a
    where e.cuenta = p_cuenta and e.ok and e.creado_en >= a.ini - interval '4 days' and e.id_orden is not null
    group by 1
  ),
  o as (
    select x.*, coalesce(ev.rem_agente, false) as rem_agente, coalesce(ev.guia_agente, false) as guia_agente,
      g.fecha_trans as guia_fecha
    from public.auto_ordenes x
    left join ev on ev.id_orden = x.id
    left join public.effi_guias g on g.cuenta = x.cuenta and g.id = x.id_guia
    where x.cuenta = p_cuenta and (select ok from permitido) and x.fecha_orden >= (select ini from a) - interval '3 days'
  )
  select jsonb_build_object(
    -- En Effi la orden deja de estar vigente al pasar a remisión: anulada es la que quedó no vigente sin remisión.
    'ordenes_hoy', count(*) filter (where fecha_orden >= (select ini from a) and not (orden_vigente is false and id_remision is null)),
    'anuladas_hoy', count(*) filter (where fecha_orden >= (select ini from a) and orden_vigente is false and id_remision is null),
    'sin_remision', count(*) filter (where orden_vigente is not false and id_remision is null),
    'rem_agente', count(*) filter (where rem_fecha >= (select ini from a) and rem_vigente is not false and rem_agente),
    'rem_humano', count(*) filter (where rem_fecha >= (select ini from a) and rem_vigente is not false and not rem_agente),
    'sin_guia_agente', count(*) filter (where id_remision is not null and rem_vigente is not false and guia is null and rem_agente),
    'sin_guia_humano', count(*) filter (where id_remision is not null and rem_vigente is not false and guia is null and not rem_agente),
    -- Guías de hoy según quién hizo la remisión (a) y quién la guía (b): aa, ah, ha, hh.
    'guia_aa', count(*) filter (where guia_fecha >= (select ini from a) and rem_agente and guia_agente),
    'guia_ah', count(*) filter (where guia_fecha >= (select ini from a) and rem_agente and not guia_agente),
    'guia_ha', count(*) filter (where guia_fecha >= (select ini from a) and not rem_agente and guia_agente),
    'guia_hh', count(*) filter (where guia_fecha >= (select ini from a) and not rem_agente and not guia_agente)
  )
  from o;
$$;
revoke all on function public.auto_fabrica(text) from public, anon;
grant execute on function public.auto_fabrica(text) to authenticated;
