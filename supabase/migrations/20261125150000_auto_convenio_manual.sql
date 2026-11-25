-- ValerIA (pedido del dueño, 25-nov-2026): la orden de Joalix que llega sin convenio de dropshipping («Sin convenio de
-- dropshipping: la orden no trae el convenio…») ya no obliga a entrar a Effi. Al pulsar «Ejecutar» se escoge el convenio
-- en una ventana; queda guardado aquí y auto-convertir lo usa cuando la orden no lo trae (la remisión sale con ese
-- convenio y la guía con el remitente de ese convenio). Ese día: 58 órdenes de VITALDROPS en Colombia sin convenio; el
-- producto siempre se ha despachado por SABANETA/BODEGA PROPIA.

create table if not exists public.auto_convenio_manual (
  cuenta text not null references public.effi_accounts(slug),
  sucursal integer not null,
  id integer not null,
  convenio text not null,
  convenio_nombre text,
  usuario_email text,
  creado_en timestamptz not null default now(),
  primary key (cuenta, sucursal, id)
);
alter table public.auto_convenio_manual enable row level security;
-- Solo por las funciones de abajo y por auto-convertir (service role).

-- Convenios con los que el país hizo remisiones en los últimos 30 días, con cuántas llevaban algún producto de esta orden.
create or replace function public.auto_convenios_disponibles(p_cuenta text, p_sucursal integer, p_id integer)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  with ok as (select public.app_es_owner() or p_cuenta = any (public.app_cuentas_visibles('automatizacion')) as ok),
  orden as (
    select coalesce((select array_agg((a->>'id')::int) from jsonb_array_elements(
      case when jsonb_typeof(o.articulos) = 'array' then o.articulos else '[]'::jsonb end) a), '{}') as arts
    from public.auto_ordenes o where o.cuenta = p_cuenta and o.sucursal = p_sucursal and o.id = p_id
  ),
  usados as (
    select r.rem_convenio as convenio, max(r.rem_convenio_nombre) as nombre, count(*) as remisiones, max(r.rem_fecha) as ultima,
      count(*) filter (where exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(r.articulos) = 'array' then r.articulos else '[]'::jsonb end) a
        where (a->>'id')::int = any (od.arts))) as con_producto
    from public.auto_ordenes r cross join orden od
    where r.cuenta = p_cuenta and (select ok from ok) and r.rem_convenio is not null
      and r.rem_fecha > now() - interval '30 days' and r.rem_vigente is not false
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('convenio', convenio, 'nombre', nombre, 'remisiones', remisiones,
    'con_producto', con_producto, 'ultima', ultima) order by con_producto desc, remisiones desc), '[]'::jsonb)
  from usados;
$function$;

-- Pone el convenio a la orden (y, si se pide, a las demás órdenes del país sin convenio con los mismos productos).
-- La orden escogida la prepara la pantalla en el momento (auto_preparar_orden); las demás van de primeras en la próxima
-- vuelta de ValerIA (cada 2 minutos, de a 15). Devuelve cuántas órdenes quedaron con el convenio.
create or replace function public.auto_poner_convenio(p_cuenta text, p_sucursal integer, p_id integer, p_convenio text, p_todas boolean default false)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_nombre text; v_arts jsonb; v_n integer;
begin
  if not (public.app_es_owner() or p_cuenta = any (public.app_cuentas_visibles('automatizacion'))) then
    raise exception 'No tienes permiso para ejecutar en este país'; end if;
  select max(r.rem_convenio_nombre) into v_nombre from public.auto_ordenes r
  where r.cuenta = p_cuenta and r.rem_convenio = p_convenio and r.rem_fecha > now() - interval '30 days';
  if v_nombre is null and not exists (select 1 from public.auto_ordenes r where r.cuenta = p_cuenta and r.rem_convenio = p_convenio
                                      and r.rem_fecha > now() - interval '30 days') then
    raise exception 'Ese convenio no tiene remisiones en este país en los últimos 30 días'; end if;
  select o.articulos into v_arts from public.auto_ordenes o where o.cuenta = p_cuenta and o.sucursal = p_sucursal and o.id = p_id
    and o.id_remision is null and o.orden_vigente is not false and o.plan_motivo like 'Sin convenio de dropshipping: la orden%';
  if not found then raise exception 'Esta orden ya no está en error por falta de convenio'; end if;

  with objetivo as (
    select o.sucursal, o.id from public.auto_ordenes o
    where o.cuenta = p_cuenta and o.id_remision is null and o.orden_vigente is not false
      and o.plan_motivo like 'Sin convenio de dropshipping: la orden%'
      and ((o.sucursal = p_sucursal and o.id = p_id) or (p_todas and o.articulos = v_arts))
  ), guardar as (
    insert into public.auto_convenio_manual (cuenta, sucursal, id, convenio, convenio_nombre, usuario_email)
    select p_cuenta, x.sucursal, x.id, p_convenio, v_nombre, (select auth.jwt()->>'email') from objetivo x
    on conflict (cuenta, sucursal, id) do update set convenio = excluded.convenio, convenio_nombre = excluded.convenio_nombre,
      usuario_email = excluded.usuario_email, creado_en = now()
    returning sucursal, id
  ), marcar as (
    -- Las demás: con el motivo nuevo y plan_en viejo, para que la próxima vuelta las prepare primero.
    update public.auto_ordenes o set plan_en = '2000-01-01',
      plan_motivo = 'Convenio ' || coalesce(v_nombre, p_convenio) || ' puesto desde el Centro de Control: ValerIA la prepara en su próxima vuelta (cada 2 minutos).'
    from guardar g where o.cuenta = p_cuenta and o.sucursal = g.sucursal and o.id = g.id and (o.sucursal, o.id) <> (p_sucursal, p_id)
    returning 1
  )
  select count(*) + 1 into v_n from marcar;
  return v_n;
end $function$;

revoke all on function public.auto_convenios_disponibles(text, integer, integer) from public, anon;
revoke all on function public.auto_poner_convenio(text, integer, integer, text, boolean) from public, anon;
grant execute on function public.auto_convenios_disponibles(text, integer, integer) to authenticated;
grant execute on function public.auto_poner_convenio(text, integer, integer, text, boolean) to authenticated;
