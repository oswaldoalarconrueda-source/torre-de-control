-- Mismo mando del agente para todas las tiendas de todas las sociedades (30-oct): Ejecutar ahora, Pasar de remisión a
-- guía, Activar automático y Ejecutar orden por orden. Las listas fijas de países pasan a ser "las cuentas tipo tienda":
-- la proveeduría (DistriLatam) queda fuera y una tienda nueva entra sola.
do $$
declare
  f regprocedure;
  d text;
  tiendas constant text := '(select a.slug from public.effi_accounts a where a.tipo = ''tienda'')';
begin
  foreach f in array array[
    'public.auto_cambiar_modo(text,text)'::regprocedure,
    'public.auto_decidir(text,integer,integer,text)'::regprocedure,
    'public.auto_ejecutar_ahora(text)'::regprocedure,
    'public.auto_ejecutar_orden(text,integer,integer,text,integer)'::regprocedure,
    'public.auto_pasar_a_guia(text)'::regprocedure,
    'public.auto_reintentar_automatico()'::regprocedure
  ] loop
    d := pg_get_functiondef(f);
    d := replace(d, $q$('TIENDA_GT', 'TIENDA_EC', 'TIENDA_CO', 'AUNCLIC_GT')$q$, tiendas);
    d := replace(d, $q$('TIENDA_GT', 'TIENDA_EC', 'AUNCLIC_GT')$q$, tiendas);
    if position('TIENDA_GT' in d) > 0 then raise exception '% todavía nombra países fijos', f; end if;
    execute d;
  end loop;
end $$;
