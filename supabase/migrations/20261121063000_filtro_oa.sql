-- Regla del dueño (20-nov): en pantalla nunca «Otra P», siempre «O.A.». El filtro de centro de costos y proveedor del
-- Resumen diario por estados (Data Experience) todavía decía «Otra P» para las órdenes de la otra plataforma.
do $do$
declare f text; d text; v text;
begin
  foreach f in array array['public.kpi_diario_dim(text[],date,date,text[],text[],text[],text)', 'public.kpi_opciones_dim(text[],date,date,text)'] loop
    d := pg_get_functiondef(f::regprocedure);
    v := d;
    d := replace(d, '''Otra P''', '''O.A.''');
    if d = v then raise exception '% sin «Otra P»', f; end if;
    execute d;
  end loop;
end $do$;
