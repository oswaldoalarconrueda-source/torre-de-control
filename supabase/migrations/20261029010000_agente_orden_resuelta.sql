-- "Ya está resuelta": la asesora quita de "Órdenes sin remisión" una orden que se arregló fuera de la Torre (el cliente
-- canceló, se despachó con otra orden…). Se guarda como decision = 'descartar' con quién y cuándo, y se puede deshacer.
-- Mientras esté resuelta, el agente no la crea (ni en automático ni en la entrega en oficina de Colombia): la orden
-- deja de estar 'lista'. Al deshacer, el agente la vuelve a preparar en la próxima corrida.

create or replace function public.auto_marcar_resuelta(p_cuenta text, p_sucursal integer, p_id integer, p_resuelta boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare quien text := (select email from auth.users where id = auth.uid());
begin
  if not (public.app_es_owner() or p_cuenta = any (public.app_cuentas_visibles('automatizacion'))) then
    raise exception 'No tienes permiso en este país'; end if;
  update public.auto_ordenes
  set decision = case when p_resuelta then 'descartar' end,
      decision_en = case when p_resuelta then now() end,
      decision_por = case when p_resuelta then quien end,
      plan_estado = case when p_resuelta and plan_estado = 'lista' then 'revision'
                         when not p_resuelta and decision = 'descartar' then null else plan_estado end,
      plan_motivo = case when p_resuelta then 'Marcada como resuelta por ' || coalesce(quien, 'una persona')
                         when not p_resuelta and decision = 'descartar' then null else plan_motivo end
  where cuenta = p_cuenta and sucursal = p_sucursal and id = p_id and id_remision is null;
  if not found then raise exception 'La orden ya tiene remisión o no existe'; end if;
end $$;
revoke all on function public.auto_marcar_resuelta(text, integer, integer, boolean) from public, anon;
grant execute on function public.auto_marcar_resuelta(text, integer, integer, boolean) to authenticated;

-- Si una corrida vuelve a dejar 'lista' una orden resuelta, se queda fuera de lo que el agente crea.
create or replace function public.auto_resuelta_no_lista() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.decision = 'descartar' and new.plan_estado = 'lista' and new.id_remision is null then
    new.plan_estado := 'revision';
    new.plan_motivo := 'Marcada como resuelta por ' || coalesce(new.decision_por, 'una persona');
  end if;
  return new;
end $$;
drop trigger if exists auto_resuelta_no_lista on public.auto_ordenes;
create trigger auto_resuelta_no_lista before insert or update on public.auto_ordenes
  for each row execute function public.auto_resuelta_no_lista();

-- auto_lista: la orden sin remisión marcada como resuelta tiene su propio estado y sale de "Órdenes sin remisión".
do $$
declare d text := pg_get_functiondef('public.auto_lista(text,integer)'::regprocedure);
begin
  if position('''resuelta''' in d) = 0 then
    d := replace(d, $q$when m.id_remision is null and exists ( -- resuelta con otra guía$q$,
      $q$when m.id_remision is null and m.decision = 'descartar' then 'resuelta'
           when m.id_remision is null and exists ( -- resuelta con otra guía$q$);
    if position('''resuelta''' in d) = 0 then raise exception 'auto_lista cambió: no se pudo agregar el estado resuelta'; end if;
    execute d;
  end if;
end $$;
