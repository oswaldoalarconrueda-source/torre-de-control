-- Agente: reintento automático (pedido del dueño, 28-oct). "Error al intentar crear la transacción Dropshipping" es un
-- tropiezo de Effi: al darle "Reintentar" a mano salía bien. Cada 5 minutos el agente repite solo las órdenes con ese
-- error (u otros pasajeros: Effi pidió esperar o no respondió), con el mismo paso y la misma transportadora de la vez
-- anterior, hasta 3 veces al día por orden y con al menos 10 minutos entre intentos. Los errores de fondo (ciudad no
-- reconocida, zona de difícil acceso, ya existe la guía…) no se reintentan: los revisa una persona.

create or replace function public.auto_reintentar_automatico()
returns integer language plpgsql security definer set search_path = '' as $$
declare o record; v_paso text; v_trans integer; n integer := 0;
begin
  for o in
    select a.cuenta, a.sucursal, a.id, a.plan
    from public.auto_ordenes a
    join public.auto_config c on c.cuenta = a.cuenta and c.modo in ('simular', 'automatico')
    where a.cuenta in ('TIENDA_GT', 'TIENDA_EC', 'TIENDA_CO')
      and a.plan_estado = 'error' and a.plan is not null and a.plan_en > now() - interval '2 days'
      -- Solo lo que de verdad falta: sin guía, y sin remisión salvo que lo que falte sea la guía de una remisión ya hecha.
      and a.guia is null and (a.id_remision is null or a.plan ? 'remision_existente')
      and (a.plan_motivo ilike '%crear la transacción Dropshipping%'
        or a.plan_motivo ilike '%demasiadas peticiones%'
        or a.plan_motivo ilike '%no respondió%'
        or a.plan_motivo ~* 'HTTP 5[0-9]{2}')
      and (select count(*) from public.auto_eventos e
           where e.cuenta = a.cuenta and e.id_orden = a.id and e.ok is false and e.paso in ('remision', 'guia')
             and e.creado_en > date_trunc('day', now())) < 4
      and not exists (select 1 from public.auto_eventos e
           where e.cuenta = a.cuenta and e.id_orden = a.id and e.creado_en > now() - interval '10 minutes')
    order by a.plan_en
    limit 4  -- de a 4 cada 5 minutos para no cargar a Effi
  loop
    v_paso := coalesce(o.plan->'eleccion'->>'paso', case when o.plan ? 'remision_existente' then 'guia' else 'ambas' end);
    v_trans := case when v_paso = 'remision' then null
                    else coalesce((o.plan->'eleccion'->>'transportadora')::int, (o.plan->'guia'->>'transportadora')::int) end;
    update public.auto_ordenes
    set decision = 'ejecutar', decision_en = now(), decision_por = 'reintento automático',
        plan = plan || jsonb_build_object('eleccion', jsonb_build_object('paso', v_paso, 'transportadora', v_trans))
    where cuenta = o.cuenta and sucursal = o.sucursal and id = o.id;
    perform public.auto_evento(o.cuenta, o.sucursal, o.id, 'inicio', null, 'Reintento automático: Effi había fallado por un error pasajero');
    perform net.http_post(
      url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-convertir?cuenta=' || o.cuenta || '&crear=' || o.sucursal || '-' || o.id,
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.auto_reintentar_automatico() from public, anon, authenticated;

select cron.unschedule('agente-reintento') where exists (select 1 from cron.job where jobname = 'agente-reintento');
select cron.schedule('agente-reintento', '*/5 * * * *', $$ select public.auto_reintentar_automatico(); $$);
