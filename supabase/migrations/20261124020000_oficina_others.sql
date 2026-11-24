-- «Disp. en oficina (Others)» (pedido del dueño, 24-nov-2026): los pedidos de la otra plataforma (Others) que esperan en la
-- oficina de la transportadora («RECLAME EN OFICINA») salen en su propia lista para llamar, con el mismo formato de
-- «Disp. en oficina» (contactos 1, 2 y 3 y observación), y el menú lateral muestra cuántos falta gestionar.
-- Las llamadas y observaciones se guardan en las mismas tablas (oficina_llamadas, oficina_observaciones) por guía.
--
-- El archivo de órdenes de Others trae nombre, teléfono y dirección del cliente. Antes no se guardaban; ahora se guardan
-- solo de los pedidos que siguen en curso, para poder llamarlos. Al cerrar un pedido (entregado, devuelto o cancelado), el
-- contacto se borra en la carga siguiente.

create table if not exists public.dropi_clientes (
  cuenta text not null references public.effi_accounts(slug),
  orden_id bigint not null,
  nombre text,
  telefono text,
  direccion text,
  ubicacion text,          -- «Ubicación de último movimiento»: dónde está el paquete (la oficina)
  notas text,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, orden_id)
);
alter table public.dropi_clientes enable row level security;
create policy dropi_clientes_leer on public.dropi_clientes for select to authenticated
  using (cuenta = any ((select public.app_cuentas_visibles('oficina'))::text[]));

-- La carga del archivo de órdenes manda los contactos de los pedidos en curso. Puede hacerlo el dueño o quien tenga
-- el módulo Cargar archivos en esa tienda.
create or replace function public.dropi_guardar_clientes(p_cuenta text, p_filas jsonb)
returns integer
language plpgsql security definer set search_path to '' as $function$
declare v_n integer;
begin
  if not (public.app_es_owner() or p_cuenta = any (public.app_cuentas_visibles('cargas'))) then
    raise exception 'No tienes permiso para cargar archivos de esta tienda'; end if;
  insert into public.dropi_clientes (cuenta, orden_id, nombre, telefono, direccion, ubicacion, notas, actualizado_en)
  select p_cuenta, (f->>'orden_id')::bigint, nullif(btrim(f->>'nombre'), ''), nullif(btrim(f->>'telefono'), ''),
         nullif(btrim(f->>'direccion'), ''), nullif(btrim(f->>'ubicacion'), ''), nullif(btrim(f->>'notas'), ''), now()
  from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) f
  where f->>'orden_id' ~ '^\d+$'
  on conflict (cuenta, orden_id) do update set nombre = excluded.nombre, telefono = excluded.telefono, direccion = excluded.direccion,
    ubicacion = excluded.ubicacion, notas = excluded.notas, actualizado_en = excluded.actualizado_en;
  get diagnostics v_n = row_count;
  -- Pedidos ya cerrados: su contacto no se necesita más.
  delete from public.dropi_clientes c using public.dropi_ordenes o
  where c.cuenta = p_cuenta and o.cuenta = c.cuenta and o.id = c.orden_id
    and o.estatus in ('ENTREGADO', 'DEVOLUCION', 'CANCELADO', 'RECHAZADO');
  return v_n;
end $function$;
revoke all on function public.dropi_guardar_clientes(text, jsonb) from public, anon;
grant execute on function public.dropi_guardar_clientes(text, jsonb) to authenticated;

-- Lista para llamar: mismo formato que oficina_lista (lo que dibuja la lista de «Disp. en oficina»).
create or replace function public.oficina_others_lista(p_cuenta text)
returns jsonb
language sql stable security definer set search_path to '' set "TimeZone" to 'UTC' as $function$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('oficina')) as ok),
  g as (
    select o.cuenta, o.id, o.guia, o.transportadora, c.nombre as destinatario, c.telefono, c.direccion, c.ubicacion,
      o.ciudad, o.departamento as provincia, o.venta as valor, o.estatus, o.fecha, o.hora, o.fecha_ultimo_movimiento,
      o.ultimo_movimiento
    from public.dropi_ordenes o
    left join public.dropi_clientes c on c.cuenta = o.cuenta and c.orden_id = o.id
    where o.cuenta = p_cuenta and (select ok from permitido)
      and o.estatus = 'RECLAME EN OFICINA' and nullif(btrim(o.guia), '') is not null
  )
  select coalesce(jsonb_agg(x order by x.llegada desc nulls last), '[]'::jsonb) from (
    select g.guia, g.transportadora, g.destinatario, null::text as id_destinatario, g.telefono, null::text as pais, g.ciudad,
      g.provincia, concat_ws(' · ', g.direccion, case when g.ubicacion is not null then 'Oficina: ' || g.ubicacion end) as direccion,
      g.valor,
      (select string_agg(coalesce(p.producto, '') || case when p.cantidad > 1 then ' x' || p.cantidad::int else '' end, ', ' order by p.linea)
       from public.dropi_orden_productos p where p.cuenta = g.cuenta and p.orden_id = g.id) as contenido,
      'Others · orden ' || g.id as centro_costos, null::text as remitente, g.estatus as estado, g.ultimo_movimiento as estado_efficommerce,
      (g.fecha + coalesce(nullif(g.hora, '')::time, '00:00'))::timestamptz as fecha_trans,
      coalesce(g.fecha_ultimo_movimiento, g.fecha)::timestamptz + interval '12 hours' as llegada,
      coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'intento', l.intento, 'resultado', l.resultado, 'canal', l.canal,
                                                    'nota', l.nota, 'usuario', l.usuario_email, 'creado_en', l.creado_en) order by l.intento)
                from public.oficina_llamadas l where l.cuenta = g.cuenta and l.guia = g.guia), '[]'::jsonb) as llamadas,
      (select jsonb_build_object('codigo', o.codigo, 'fecha', o.fecha_compromiso, 'texto', o.observacion,
                                 'usuario', o.usuario_email, 'actualizado_en', o.actualizado_en)
       from public.oficina_observaciones o where o.cuenta = g.cuenta and o.guia = g.guia) as observacion
    from g
  ) x;
$function$;
revoke all on function public.oficina_others_lista(text) from public, anon;
grant execute on function public.oficina_others_lista(text) to authenticated;

-- Número del menú lateral: pedidos de Others en oficina que falta gestionar hoy, por tienda visible. Cuenta los que no
-- tienen llamada hoy, salvo los que tienen un compromiso de retiro para un día que no ha llegado o que el cliente dijo
-- que ya retiró hace 7 días o menos.
create or replace function public.oficina_others_pendientes()
returns jsonb
language sql stable security definer set search_path to '' set "TimeZone" to 'UTC' as $function$
  with t as (
    select a.slug, (now() + make_interval(mins => coalesce(a.tz_offset_min, -300)))::date as hoy, coalesce(a.tz_offset_min, -300) as tz
    from public.effi_accounts a where a.slug = any (public.app_cuentas_visibles('oficina'))
  )
  select coalesce(jsonb_object_agg(slug, n), '{}'::jsonb) from (
    select t.slug, count(*)::int as n
    from t join public.dropi_ordenes o on o.cuenta = t.slug
    left join public.oficina_observaciones ob on ob.cuenta = o.cuenta and ob.guia = o.guia
    where o.estatus = 'RECLAME EN OFICINA' and nullif(btrim(o.guia), '') is not null
      and not exists (select 1 from public.oficina_llamadas l where l.cuenta = o.cuenta and l.guia = o.guia
                      and (l.creado_en + make_interval(mins => t.tz))::date = t.hoy)
      and not coalesce(ob.codigo = 'retira_fecha' and ob.fecha_compromiso > t.hoy, false)
      and not coalesce(ob.codigo = 'ya_retiro' and ob.actualizado_en > now() - interval '7 days', false)
    group by t.slug
  ) x;
$function$;
revoke all on function public.oficina_others_pendientes() from public, anon;
grant execute on function public.oficina_others_pendientes() to authenticated;
