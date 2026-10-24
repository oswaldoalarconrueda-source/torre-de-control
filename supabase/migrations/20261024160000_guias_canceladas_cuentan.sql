-- Las guías "Cancelada por transportadora" (estado Effi 7) ahora cuentan como en Effi: entran en guías, venta y
-- flete del periodo con el estado CANCELADA (antes EXCLUIDA, que se descartaba). Como nunca se despacharon, no
-- llevan costo de mercancía y, igual que las indemnizaciones, salen de la base del % devolución y la efectividad.

create or replace function public.effi_estado_unificado(p_est integer) returns text
language sql immutable set search_path = '' as $$
  select case p_est
    when 4 then 'ENTREGADO' when 5 then 'DEVOLUCION'
    when 2 then 'EN_TRANSITO' when 8 then 'EN_TRANSITO'
    when 3 then 'NOVEDAD' when 1 then 'PENDIENTE' when 9 then 'EN_OFICINA'
    when 6 then 'INDEMNIZACION' when 7 then 'CANCELADA'
    else 'PENDIENTE' end;
$$;

-- Ajuste puntual de las funciones que ya existen (se reescribe solo el fragmento que cambia).
do $$
declare
  f text;
  def text;
  cambios text[][] := array[
    -- efectividad: la base deja fuera indemnizaciones y canceladas
    array['kpi_resumen', 'estado_u <> ''INDEMNIZACION''', 'estado_u not in (''INDEMNIZACION'', ''CANCELADA'')'],
    array['kpi_transportadoras', 'estado_u <> ''INDEMNIZACION''', 'estado_u not in (''INDEMNIZACION'', ''CANCELADA'')'],
    -- novedades abiertas: una cancelada ya terminó
    array['kpi_novedades', 'estado_u not in (''ENTREGADO'', ''DEVOLUCION'')', 'estado_u not in (''ENTREGADO'', ''DEVOLUCION'', ''CANCELADA'')'],
    -- costo de mercancía: una cancelada no se despachó
    array['kpi_despacho', 'case when g.estado_u = ''DEVOLUCION'' then 0', 'case when g.estado_u in (''DEVOLUCION'', ''CANCELADA'') then 0'],
    array['kpi_despacho', '(coalesce(g.costo, 0) = 0 and g.estado_u <> ''DEVOLUCION'')', '(coalesce(g.costo, 0) = 0 and g.estado_u not in (''DEVOLUCION'', ''CANCELADA''))']
  ];
  i int;
begin
  for i in 1 .. array_length(cambios, 1) loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = cambios[i][1];
    if position(cambios[i][2] in def) = 0 then
      raise exception 'No encontré el fragmento a cambiar en %', cambios[i][1];
    end if;
    execute replace(def, cambios[i][2], cambios[i][3]);
  end loop;
end $$;

-- v_guias calcula estado_u con su propio CASE (no usa effi_estado_unificado): se cambia el mismo literal.
do $$
declare def text := pg_get_viewdef('public.v_guias'::regclass);
begin
  if position('''EXCLUIDA''::text' in def) = 0 then raise exception 'v_guias ya no tiene EXCLUIDA'; end if;
  execute 'create or replace view public.v_guias with (security_invoker = true) as '
    || replace(def, '''EXCLUIDA''::text', '''CANCELADA''::text');
end $$;

-- Los resúmenes guardan el estado calculado: se recalculan ya.
refresh materialized view public.effi_mv_dia;
refresh materialized view public.effi_mv_dia_dim;
refresh materialized view public.effi_mv_ciudad;
