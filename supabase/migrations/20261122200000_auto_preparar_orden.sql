-- «Ejecutar» sin esperar a ValerIA (22-nov-2026, pedido de la encargada de Colombia): una orden recién llegada que la
-- vuelta de cada 2 minutos todavía no prepara se puede preparar en el momento. auto_preparar_orden pide a auto-convertir
-- el plan de esa sola orden (?preparar=sucursal-id, sin crear nada) y la pantalla consulta auto_estado_orden hasta que
-- el plan llega; entonces abre el panel de Ejecutar como siempre. «Siempre disponible» (pedido del dueño): también la orden
-- en revisión sin remisión armada se vuelve a preparar (por ejemplo, ya corrigieron el nombre en Effi), y la orden en
-- revisión que sí trae la remisión (trato especial, deficiencia en entregas) la puede ejecutar la persona que la atiende.
-- El pedido con abono nunca: se hace a mano en Effi.

create or replace function public.auto_preparar_orden(p_cuenta text, p_sucursal integer, p_id integer)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare o record;
begin
  if not (public.app_es_owner() or p_cuenta = any (public.app_cuentas_visibles('automatizacion'))) then
    raise exception 'No tienes permiso para ejecutar en este país'; end if;
  if p_cuenta not in (select a.slug from public.effi_accounts a where a.tipo = 'tienda') then raise exception 'La creación no está montada para este país'; end if;
  select * into o from public.auto_ordenes where cuenta = p_cuenta and sucursal = p_sucursal and id = p_id;
  if o is null then raise exception 'Esta orden todavía no está en el Centro de Control'; end if;
  if o.id_remision is not null then raise exception 'Esta orden ya tiene remisión'; end if;
  if o.orden_vigente is false then raise exception 'Esta orden está anulada en Effi'; end if;
  if coalesce((o.plan->>'abono')::boolean, false) then raise exception 'Pedido con abono: se hace a mano en Effi'; end if;
  -- Ya preparada (por ejemplo, la vuelta de ValerIA llegó primero): no hay nada que pedir. Sí se vuelve a preparar la que
  -- quedó en revisión sin remisión armada.
  if o.plan_estado is not null and not (o.plan_estado = 'revision' and o.plan->'remision' is null) then return; end if;
  perform net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-convertir?cuenta=' || p_cuenta || '&preparar=' || p_sucursal || '-' || p_id,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 90000);
end $function$;

create or replace function public.auto_estado_orden(p_cuenta text, p_sucursal integer, p_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not (public.app_es_owner() or p_cuenta = any (public.app_cuentas_visibles('automatizacion'))) then
    raise exception 'No tienes permiso para ver este país'; end if;
  return (select jsonb_build_object('plan_estado', o.plan_estado, 'plan_motivo', o.plan_motivo, 'plan_en', o.plan_en, 'id_remision', o.id_remision,
            'con_remision', o.plan ? 'remision')
          from public.auto_ordenes o where o.cuenta = p_cuenta and o.sucursal = p_sucursal and o.id = p_id);
end $function$;

revoke all on function public.auto_preparar_orden(text, integer, integer) from public, anon;
revoke all on function public.auto_estado_orden(text, integer, integer) from public, anon;
grant execute on function public.auto_preparar_orden(text, integer, integer) to authenticated;
grant execute on function public.auto_estado_orden(text, integer, integer) to authenticated;

-- Ejecutar: también la orden en revisión que ya trae la remisión armada; nunca el pedido con abono.
do $do$
declare d text := pg_get_functiondef('public.auto_ejecutar_orden(text,integer,integer,text,integer)'::regprocedure); v text := d;
begin
  d := replace(d, $a$if o is null or o.plan_estado not in ('lista', 'error') or o.plan is null then raise exception 'Esta orden no tiene nada listo para crear'; end if;$a$,
    $a$if o is null or o.plan is null or not (o.plan_estado in ('lista', 'error') or (o.plan_estado = 'revision' and o.plan->'remision' is not null)) then
    raise exception 'Esta orden no tiene nada listo para crear'; end if;
  if coalesce((o.plan->>'abono')::boolean, false) then raise exception 'Pedido con abono: se hace a mano en Effi'; end if;$a$);
  if d = v then raise exception 'auto_ejecutar_orden: no se encontró la validación'; end if;
  execute d;
end $do$;
