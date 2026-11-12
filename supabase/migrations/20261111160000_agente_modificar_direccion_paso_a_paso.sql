-- 🤖 Agente, «Modificar dirección» paso a paso (pedido del dueño, 11-nov-2026): la persona escoge qué cambia (provincia,
-- ciudad y/o dirección), se cambia en la orden de Effi por API y, apenas Effi lo confirma, el agente vuelve a preparar la
-- remisión con la dirección nueva para poder darle «Ejecutar» ahí mismo.

-- Provincias (departamentos) del país de la tienda, del catálogo de Effi.
create or replace function public.effi_provincias(p_cuenta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with p as (
    select o.pais_id from public.auto_ordenes o
    where o.cuenta = p_cuenta and o.pais_id is not null and p_cuenta = any (public.app_cuentas_visibles('automatizacion'))
    order by o.fecha_orden desc limit 1)
  select coalesce(jsonb_agg(jsonb_build_object('provincia_id', x.provincia_id, 'provincia', x.provincia) order by x.provincia), '[]'::jsonb)
  from (select distinct c.provincia_id, c.provincia from public.effi_ciudades c where c.pais_id = (select pais_id from p)) x;
$$;
revoke all on function public.effi_provincias(text) from public, anon;
grant execute on function public.effi_provincias(text) to authenticated;

-- Ciudades de una provincia.
create or replace function public.effi_ciudades_provincia(p_cuenta text, p_provincia_id integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  with p as (
    select o.pais_id from public.auto_ordenes o
    where o.cuenta = p_cuenta and o.pais_id is not null and p_cuenta = any (public.app_cuentas_visibles('automatizacion'))
    order by o.fecha_orden desc limit 1)
  select coalesce(jsonb_agg(jsonb_build_object('pais_id', c.pais_id, 'provincia_id', c.provincia_id, 'provincia', c.provincia,
      'ciudad_id', c.ciudad_id, 'ciudad', c.ciudad) order by c.ciudad), '[]'::jsonb)
  from public.effi_ciudades c
  where c.pais_id = (select pais_id from p) and c.provincia_id = p_provincia_id;
$$;
revoke all on function public.effi_ciudades_provincia(text, integer) from public, anon;
grant execute on function public.effi_ciudades_provincia(text, integer) to authenticated;

-- Seguimiento liviano de una orden mientras se cambia la dirección: la última acción y si ya tiene plan nuevo.
create or replace function public.auto_orden_seguimiento(p_cuenta text, p_sucursal integer, p_id integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'accion', (select jsonb_build_object('tipo', a.tipo, 'estado', a.estado, 'mensaje', a.mensaje)
               from public.auto_acciones a where a.cuenta = p_cuenta and a.sucursal = p_sucursal and a.orden_id = p_id
               order by a.creado_en desc limit 1),
    'plan_estado', o.plan_estado, 'id_remision', o.id_remision)
  from public.auto_ordenes o
  where o.cuenta = p_cuenta and o.sucursal = p_sucursal and o.id = p_id
    and p_cuenta = any (public.app_cuentas_visibles('automatizacion'));
$$;
revoke all on function public.auto_orden_seguimiento(text, integer, integer) from public, anon;
grant execute on function public.auto_orden_seguimiento(text, integer, integer) to authenticated;

-- Resultado de la acción: si la dirección quedó cambiada, se pide de una vez la corrida del agente de ese país (la misma
-- del horario) para que prepare la remisión con la dirección nueva sin esperar al siguiente turno.
create or replace function public.auto_accion_resultado(p_id bigint, p_ok boolean, p_mensaje text)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  update public.auto_acciones set estado = case when p_ok then 'ok' else 'error' end, mensaje = p_mensaje, hecho_en = now()
  where id = p_id returning * into a;
  if a is null then return; end if;
  if p_ok and a.tipo = 'direccion' then
    update public.auto_ordenes set direccion = a.datos->>'direccion', ciudad = a.datos->>'ciudad', provincia = a.datos->>'provincia',
      ciudad_id = (a.datos->>'ciudad_id')::int, provincia_id = (a.datos->>'provincia_id')::int,
      plan = null, plan_estado = null, plan_motivo = null, plan_en = null, decision = null, direccion_marcada_en = null, direccion_marcada_por = null, actualizado_en = now()
    where cuenta = a.cuenta and sucursal = a.sucursal and id = a.orden_id;
    if exists (select 1 from public.auto_config c where c.cuenta = a.cuenta and c.modo in ('simular', 'automatico')) then
      perform net.http_post(
        url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-convertir?cuenta=' || a.cuenta,
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
        body := '{}'::jsonb, timeout_milliseconds := 10000);
    end if;
  elsif p_ok and a.tipo = 'anular' then
    update public.auto_ordenes set orden_vigente = false, actualizado_en = now()
    where cuenta = a.cuenta and sucursal = a.sucursal and id = a.orden_id;
  end if;
  perform public.auto_evento(a.cuenta, a.sucursal, a.orden_id, 'fin', p_ok,
    case a.tipo when 'direccion' then 'Dirección ' else 'Anulación ' end || case when p_ok then 'hecha en Effi' else 'no se pudo: ' || coalesce(p_mensaje, '') end);
end $$;
