-- El gasto de Meta (API y CSV del BM) es de Joalix AA Group: el país de entrega decide la tienda, pero solo entre las
-- tiendas de Joalix. Valka también es tienda de Guatemala y sin este filtro el gasto de GT se le duplicaba.
delete from public.app_publicidad_campanas where cuenta = 'VALKA_GT';
delete from public.app_publicidad_diaria where cuenta = 'VALKA_GT';

do $$
declare f text;
begin
  foreach f in array array['public.meta_guardar(jsonb, text[], date, date)', 'public.app_cargar(text, text, text, jsonb, bigint, jsonb)'] loop
    execute replace(pg_get_functiondef(f::regprocedure),
      'join public.effi_accounts a on a.pais = r.pais and a.tipo = ''tienda''',
      'join public.effi_accounts a on a.pais = r.pais and a.tipo = ''tienda'' and a.sociedad = ''Joalix AA Group''');
  end loop;
end $$;
