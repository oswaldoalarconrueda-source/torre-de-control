-- Agente, "Ejecutar" orden por orden con elección del dueño: qué paso (orden → remisión, remisión → guía o los dos) y
-- por qué transportadora. La elección queda en plan.eleccion y la función auto-convertir la respeta. Sirve para
-- Guatemala, Ecuador y Colombia (Colombia solo así, orden por orden, mientras el dueño da sus condiciones).
create or replace function public.auto_ejecutar_orden(p_cuenta text, p_sucursal integer, p_id integer, p_paso text,
  p_transportadora integer default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño puede ejecutar'; end if;
  if p_cuenta not in ('TIENDA_GT', 'TIENDA_EC', 'TIENDA_CO') then raise exception 'La creación no está montada para este país'; end if;
  if p_paso not in ('ambas', 'remision', 'guia') then raise exception 'Paso inválido'; end if;
  select * into o from public.auto_ordenes where cuenta = p_cuenta and sucursal = p_sucursal and id = p_id;
  if o is null or o.plan_estado not in ('lista', 'error') or o.plan is null then raise exception 'Esta orden no tiene nada listo para crear'; end if;
  if p_paso in ('ambas', 'remision') and o.plan->'remision' is null then raise exception 'Esta orden no tiene la remisión lista'; end if;
  if p_paso = 'guia' and (o.plan->'remision_existente' is null or o.plan->'guia' is null) then
    raise exception 'Esta orden no tiene una remisión lista para la guía';
  end if;
  if p_transportadora is not null and not exists (
    select 1 from public.auto_config c where c.cuenta = p_cuenta and c.reglas->'transportes' ? p_transportadora::text) then
    raise exception 'Esa transportadora no está entre las que usa este país';
  end if;
  update public.auto_ordenes
  set decision = 'ejecutar', decision_en = now(), decision_por = (select email from auth.users where id = auth.uid()),
      plan = plan || jsonb_build_object('eleccion', jsonb_build_object('paso', p_paso, 'transportadora', p_transportadora))
  where cuenta = p_cuenta and sucursal = p_sucursal and id = p_id;
  perform public.auto_evento(p_cuenta, p_sucursal, p_id, 'inicio', null,
    'Orden enviada a crear por ' || coalesce((select email from auth.users where id = auth.uid()), 'el dueño')
    || case p_paso when 'remision' then ' (solo la remisión)' when 'guia' then ' (solo la guía)' else '' end);
  perform net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-convertir?cuenta=' || p_cuenta || '&crear=' || p_sucursal || '-' || p_id,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
end $$;
revoke all on function public.auto_ejecutar_orden(text, integer, integer, text, integer) from public, anon;
grant execute on function public.auto_ejecutar_orden(text, integer, integer, text, integer) to authenticated;
