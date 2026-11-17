-- La demostración no se ajusta: los medidores y el análisis de novedades aceptan p_todas (por defecto false).
-- Con p_todas = true (solo lo pasa la demo) cuentan también Inter Rapidísimo, como antes del cambio.

do $do$
declare
  r record; f text; nuevo text;
begin
  for r in select * from (values
    ('public.novedades_medidores(text[],date,date)', 'p_hasta date DEFAULT NULL::date)'),
    ('public.kpi_novedades(text[],date,date)', 'p_hasta date)')
  ) v(fn, cabeza) loop
    f := pg_get_functiondef(r.fn::regprocedure);
    nuevo := replace(f, r.cabeza, replace(r.cabeza, ')', ', p_todas boolean DEFAULT false)'));
    nuevo := replace(nuevo, 'not public.novedad_ignorada(n)', '(p_todas or not public.novedad_ignorada(n))');
    nuevo := replace(nuevo, 'not public.novedad_ignorada(nv)', '(p_todas or not public.novedad_ignorada(nv))');
    nuevo := replace(nuevo, 'and public.novedad_ignorada(x))', 'and public.novedad_ignorada(x) and not p_todas)');
    if nuevo = f or position('p_todas boolean' in nuevo) = 0 then raise exception 'Sin cambio en %', r.fn; end if;
    execute 'drop function ' || r.fn;
    execute nuevo;
  end loop;
end $do$;

revoke all on function public.novedades_medidores(text[], date, date, boolean) from public, anon;
revoke all on function public.kpi_novedades(text[], date, date, boolean) from public, anon;
grant execute on function public.novedades_medidores(text[], date, date, boolean) to authenticated, service_role;
grant execute on function public.kpi_novedades(text[], date, date, boolean) to authenticated, service_role;
