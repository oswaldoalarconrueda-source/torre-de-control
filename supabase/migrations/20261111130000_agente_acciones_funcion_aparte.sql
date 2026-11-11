-- Las acciones sobre la orden (cambiar dirección, anular) y el catálogo de ciudades van a la función agente-acciones,
-- aparte de auto-convertir (que crea remisiones y guías), para no tocarla.
do $$
declare d text := pg_get_functiondef('public.auto_orden_accion(text,integer,integer,text,jsonb)'::regprocedure);
begin
  if position('functions/v1/agente-acciones' in d) > 0 then return; end if;
  execute replace(d, 'functions/v1/auto-convertir?cuenta=', 'functions/v1/agente-acciones?cuenta=');
end $$;
