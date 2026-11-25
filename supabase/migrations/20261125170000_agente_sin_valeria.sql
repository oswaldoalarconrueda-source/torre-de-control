-- 25-nov-2026: la agente deja de llamarse «ValerIA» y pasa a «Agente». El mensaje que deja auto_poner_convenio dice
-- «el agente».
do $do$
declare d text := pg_get_functiondef('public.auto_poner_convenio(text, integer, integer, text, boolean)'::regprocedure);
begin
  if position('ValerIA la prepara' in d) = 0 then raise exception 'no se encontró el texto en auto_poner_convenio'; end if;
  execute replace(d, 'ValerIA la prepara', 'el agente la prepara');
end $do$;
