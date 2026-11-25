-- Agente (25-nov-2026): si al pulsar «Sí, crear» el agente ya había creado la orden en su vuelta, se dice eso en vez de
-- «Esta orden no tiene nada listo para crear». Solo cuando ya quedó creada del todo (plan «creada») y no es el paso de la
-- guía: una remisión con la guía fallida se puede seguir reintentando.
do $do$
declare d text := pg_get_functiondef('public.auto_ejecutar_orden(text, integer, integer, text, integer)'::regprocedure);
  viejo text := '  if o is null or o.plan is null or not';
begin
  if position('ya la creó el agente' in d) > 0 then return; end if;
  if position(viejo in d) = 0 then raise exception 'no se encontró el texto en auto_ejecutar_orden'; end if;
  execute replace(d, viejo,
    '  if p_paso <> ''guia'' and o.plan_estado = ''creada'' then
    raise exception ''Esta orden ya la creó el agente (tiene remisión): no hay que ejecutarla''; end if;
' || viejo);
end $do$;
