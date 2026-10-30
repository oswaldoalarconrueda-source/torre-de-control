-- Remisiones directas (30-oct): en A un clic casi todo entra por Lucid, que crea la remisión sin orden de venta, y el
-- agente solo le hace la guía. El Agente estaba armado sobre las órdenes, así que esas remisiones y sus guías no salían
-- en ninguna parte. Ahora: auto_directas() las lista por periodo (la guía con su remisión, cliente y quién la hizo) y
-- auto_fabrica las suma a remisiones y guías (remisión de persona/Lucid; guía del agente o de una persona).

-- Guías del periodo (hora local del país) hechas sobre una remisión que no viene de una orden vigilada.
create or replace function public.auto_directas(p_cuenta text, p_desde date default null, p_hasta date default null)
returns jsonb language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with a as (
    select coalesce(p_desde, (now() + make_interval(mins => tz_offset_min))::date)::timestamp - make_interval(mins => tz_offset_min) as ini,
           (coalesce(p_hasta, p_desde, (now() + make_interval(mins => tz_offset_min))::date) + 1)::timestamp - make_interval(mins => tz_offset_min) as fin
    from public.effi_accounts where slug = p_cuenta
  ),
  d as (
    select g.id, g.guia, g.id_ref as remision, g.fecha_trans, g.nombre_destinatario as cliente, g.nombre_ciudad_destinatario as ciudad,
      g.valor_recaudo, g.nombre_centro_costos as centro, split_part(g.nombre_transportadora, '|', 1) as transportadora,
      coalesce(g.estado_efficommerce, g.estado) as estado,
      exists (select 1 from public.auto_eventos e where e.cuenta = g.cuenta and e.paso = 'guia' and e.ok
              and e.mensaje like 'Guía ' || g.guia || ' creada%') as agente
    from public.effi_guias g, a
    where g.cuenta = p_cuenta and p_cuenta = any (public.app_cuentas_visibles('automatizacion'))
      and g.t_trans_ref = 4 and g.vigente is not false and g.fecha_trans >= a.ini and g.fecha_trans < a.fin
      and not exists (select 1 from public.auto_ordenes o where o.cuenta = g.cuenta and o.id_remision = g.id_ref)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'guia', guia, 'remision', remision, 'fecha', fecha_trans, 'cliente', cliente, 'ciudad', ciudad,
    'recaudo', valor_recaudo, 'centro', centro, 'transportadora', trim(transportadora), 'estado', estado,
    'hecha_por', case when agente then 'agente' else 'persona' end
  ) order by fecha_trans desc), '[]'::jsonb) from d;
$$;
revoke all on function public.auto_directas(text, date, date) from public, anon;
grant execute on function public.auto_directas(text, date, date) to authenticated;

-- auto_fabrica: las guías de remisiones directas cuentan en remisiones (hechas por persona/Lucid) y en guías.
do $$
declare d text := pg_get_functiondef('public.auto_fabrica(text,date,date)'::regprocedure);
begin
  if position('directas' in d) = 0 then
    d := replace(d, $q$  select jsonb_build_object(
    'ordenes_hoy'$q$, $q$  , dir as (
    select coalesce(sum(case when (x->>'hecha_por') = 'agente' then 1 else 0 end), 0)::int as agente,
           coalesce(sum(case when (x->>'hecha_por') = 'agente' then 0 else 1 end), 0)::int as persona
    from jsonb_array_elements(public.auto_directas(p_cuenta, p_desde, p_hasta)) x
  )
  select jsonb_build_object(
    'directas_agente', (select agente from dir), 'directas_persona', (select persona from dir),
    'ordenes_hoy'$q$);
    d := replace(d, $q$'rem_humano', count(*)$q$, $q$'rem_humano', (select agente + persona from dir) + count(*)$q$);
    d := replace(d, $q$'guia_ha', count(*)$q$, $q$'guia_ha', (select agente from dir) + count(*)$q$);
    d := replace(d, $q$'guia_hh', count(*)$q$, $q$'guia_hh', (select persona from dir) + count(*)$q$);
    if position('directas_agente' in d) = 0 or position('(select agente from dir) + count' in d) = 0
       or position('(select persona from dir) + count' in d) = 0 or position('agente + persona from dir' in d) = 0 then
      raise exception 'auto_fabrica cambió: no se pudieron sumar las remisiones directas';
    end if;
    execute d;
  end if;
end $$;
