-- Novedades: las de Inter Rapidísimo (Colombia, transportadora Efficommerce 3) no cuentan en el panel de novedades:
-- ni en la bandeja, ni en los medidores, ni en el análisis. La demostración no se toca.

create or replace function public.novedad_ignorada(n public.effi_novedades)
returns boolean language sql immutable set search_path to '' as $$
  select coalesce(n.transportadora_efficommerce = 3, false); -- 3 = INTER RAPIDÍSIMO (solo opera en Colombia)
$$;

do $do$
declare
  f text;
  nuevo text;
  cambios jsonb := jsonb_build_array(
    -- bandeja
    jsonb_build_array('public.novedades_bandeja(text[])',
      'and not public.novedad_en_devolucion(n)', 'and not public.novedad_en_devolucion(n) and not public.novedad_ignorada(n)'),
    -- medidores: llegaron, pendientes y pendientes por asesora
    jsonb_build_array('public.novedades_medidores(text[],date,date)',
      'where n.t_novedad = 2 and n.vigente is not false and n.fecha_trans >= c.desde', 'where n.t_novedad = 2 and n.vigente is not false and not public.novedad_ignorada(n) and n.fecha_trans >= c.desde'),
    jsonb_build_array('public.novedades_medidores(text[],date,date)',
      'and n.est_novedad = 1 and not public.novedad_en_devolucion(n) group by 1', 'and n.est_novedad = 1 and not public.novedad_en_devolucion(n) and not public.novedad_ignorada(n) group by 1'),
    jsonb_build_array('public.novedades_medidores(text[],date,date)',
      'and n.vigente is not false and not public.novedad_en_devolucion(n)\n', 'and n.vigente is not false and not public.novedad_en_devolucion(n) and not public.novedad_ignorada(n)\n'),
    -- medidores: soluciones enviadas
    jsonb_build_array('public.novedades_medidores(text[],date,date)',
      'where e.estado = ''enviada''', 'where e.estado = ''enviada'' and not public.novedad_ignorada(n)'),
    -- medidores: llamadas
    jsonb_build_array('public.novedades_medidores(text[],date,date)',
      'where l.creado_en >= c.desde and l.creado_en < c.hasta)',
      'where l.creado_en >= c.desde and l.creado_en < c.hasta and not exists (select 1 from public.effi_novedades x where x.cuenta = l.cuenta and x.empresa = l.empresa and x.id = l.novedad and public.novedad_ignorada(x)))'),
    -- análisis
    jsonb_build_array('public.kpi_novedades(text[],date,date)',
      'where nv.t_novedad = 2 and nv.vigente is not false', 'where nv.t_novedad = 2 and nv.vigente is not false and not public.novedad_ignorada(nv)')
  );
  c jsonb;
begin
  for c in select * from jsonb_array_elements(cambios) loop
    f := pg_get_functiondef((c->>0)::regprocedure);
    nuevo := replace(f, replace(c->>1, '\n', E'\n'), replace(c->>2, '\n', E'\n'));
    if nuevo = f then raise exception 'No se encontró el texto a cambiar en %: %', c->>0, c->>1; end if;
    execute nuevo;
  end loop;
end $do$;
