-- Agente: "Reintentar" en la lista de errores de hoy, a un clic. Repite la orden con lo que se escogió la vez anterior
-- (paso y transportadora); si nunca se escogió, los dos pasos (o solo la guía si la remisión ya existía) con la
-- transportadora del plan. Los permisos y las validaciones son los de auto_ejecutar_orden.
create or replace function public.auto_reintentar(p_cuenta text, p_id integer)
returns void language plpgsql security definer set search_path = '' as $$
declare o record; v_paso text; v_trans integer;
begin
  select * into o from public.auto_ordenes where cuenta = p_cuenta and id = p_id order by sucursal desc limit 1;
  if o is null then raise exception 'No se encontró la orden %', p_id; end if;
  v_paso := coalesce(o.plan->'eleccion'->>'paso', case when o.plan ? 'remision_existente' then 'guia' else 'ambas' end);
  v_trans := case when v_paso = 'remision' then null
                  else coalesce((o.plan->'eleccion'->>'transportadora')::int, (o.plan->'guia'->>'transportadora')::int) end;
  perform public.auto_ejecutar_orden(p_cuenta, o.sucursal, p_id, v_paso, v_trans);
end $$;
revoke all on function public.auto_reintentar(text, integer) from public, anon;
grant execute on function public.auto_reintentar(text, integer) to authenticated;
