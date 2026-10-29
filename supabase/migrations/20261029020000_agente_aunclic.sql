-- Agente de órdenes para A un clic Guatemala (AUNCLIC_GT, 29-oct), igual que Joalix Guatemala: "Ejecutar" orden por
-- orden, "Ejecutar ahora", "Pasar de remisión a guía", el reintento automático y el modo Automático. Arranca en Manual
-- ('simular'): prepara cada orden y muestra qué crearía, sin crear nada hasta que alguien lo pida.
do $$
declare
  f text;
  d text;
begin
  foreach f in array array[
    'public.auto_cambiar_modo(text,text)', 'public.auto_decidir(text,integer,integer,text)',
    'public.auto_ejecutar_ahora(text)', 'public.auto_ejecutar_orden(text,integer,integer,text,integer)',
    'public.auto_pasar_a_guia(text)', 'public.auto_reintentar_automatico()'] loop
    d := pg_get_functiondef(f::regprocedure);
    if position('AUNCLIC_GT' in d) = 0 then
      d := replace(replace(d, $q$('TIENDA_GT', 'TIENDA_EC', 'TIENDA_CO')$q$, $q$('TIENDA_GT', 'TIENDA_EC', 'TIENDA_CO', 'AUNCLIC_GT')$q$),
                   $q$('TIENDA_GT', 'TIENDA_EC')$q$, $q$('TIENDA_GT', 'TIENDA_EC', 'AUNCLIC_GT')$q$);
      if position('AUNCLIC_GT' in d) = 0 then raise exception '% cambió: no se pudo agregar A un clic', f; end if;
      execute d;
    end if;
  end loop;
end $$;

update public.auto_config set modo = 'simular', actualizado_en = now() where cuenta = 'AUNCLIC_GT' and modo = 'vigilar';
