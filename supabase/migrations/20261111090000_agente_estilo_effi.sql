-- 🤖 Agente con la lista de órdenes "estilo Effi" (pedido del dueño, 11-nov-2026): fecha y número, cliente con su centro de
-- costos, documento, teléfono y dirección completa en la misma celda, subtotal/impuestos/total, pago, historial del cliente
-- (huella) y las transportadoras a la vista con su % de entrega en esa ciudad. Para Joalix y Valka (entran por orden de venta).

-- 1) Datos de la orden que faltaban (los trae la vigilancia de Effi desde ahora).
alter table public.auto_ordenes
  add column if not exists centro_orden text,
  add column if not exists documento text,
  add column if not exists telefono text,
  add column if not exists direccion text,
  add column if not exists pais_id integer,
  add column if not exists provincia_id integer,
  add column if not exists ciudad_id integer,
  add column if not exists subtotal numeric,
  add column if not exists impuestos numeric,
  add column if not exists observacion text,
  add column if not exists cliente_id integer;

create or replace function public.auto_ingest(p_cuenta text, p_ordenes jsonb, p_remisiones jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with o as (
    select x from jsonb_array_elements(p_ordenes) r, jsonb_array_elements(r->'data') x
  ), rem as (
    select x from jsonb_array_elements(p_remisiones) r, jsonb_array_elements(r->'data') x
  ), filas as (
    select distinct on ((o.x->>'sucursal')::int, (o.x->>'id')::int)
      p_cuenta as cuenta, (o.x->>'sucursal')::int as sucursal, (o.x->>'id')::int as id,
      ((o.x->>'fecha_trans') || '+00')::timestamptz as fecha_orden,
      o.x->>'nombre_cliente' as cliente, o.x->>'nombre_ciudad' as ciudad, o.x->>'nombre_provincia' as provincia,
      (o.x->>'total')::numeric as total, o.x->>'nombre_ecommerce' as ecommerce, o.x->>'name_venta_ecommerce' as pedido,
      substring(o.x->>'observacion' from 'Dropshipping:\s*([A-Za-z0-9]+)') as convenio_orden,
      coalesce(ltrim(o.x->>'nombre_cliente') like '*%', false) as recuperado,
      o.x->>'estado' as est_orden, (o.x->>'vigente') = '1' as orden_vigente, o.x->>'responsable' as responsable_orden,
      (o.x->>'sucursal_remision_v')::int as sucursal_remision, (o.x->>'id_remision_v')::int as id_remision,
      ((rem.x->>'fecha_trans') || '+00')::timestamptz as rem_fecha,
      (rem.x->>'centro_costos')::int as rem_centro, rem.x->>'nombre_centro_costos' as rem_centro_nombre,
      rem.x->>'convenio_dropshipping' as rem_convenio, rem.x->>'nombre_convenio_dropshipping' as rem_convenio_nombre,
      case when rem.x is null then null else (rem.x->>'vigente') = '1' end as rem_vigente,
      rem.x->>'responsable' as rem_responsable,
      (rem.x->>'id_guia_transporte')::int as id_guia, rem.x->>'guia' as guia,
      rem.x->>'estado_dropshipping' as rem_dropshipping,
      -- Nuevos: si la vigilancia todavía no los manda, quedan en null y no pisan lo guardado.
      nullif(o.x->>'nombre_centro_costos', '') as centro_orden,
      nullif(trim(coalesce(o.x->>'abreviacion', '') || ' ' || coalesce(o.x->>'id_cliente', '')), '') as documento,
      nullif(o.x->>'telefono_cliente', '') as telefono, nullif(o.x->>'direccion_cliente', '') as direccion,
      (o.x->>'pais_cliente')::int as pais_id, (o.x->>'provincia_cliente')::int as provincia_id, (o.x->>'ciudad_cliente')::int as ciudad_id,
      (o.x->>'subtotal')::numeric as subtotal, (o.x->>'impuestos')::numeric as impuestos,
      nullif(o.x->>'observacion', '') as observacion, (o.x->>'cliente')::int as cliente_id
    from o
    left join rem on (rem.x->>'sucursal') = (o.x->>'sucursal_remision_v') and (rem.x->>'id') = (o.x->>'id_remision_v')
  )
  insert into public.auto_ordenes as a (cuenta, sucursal, id, fecha_orden, cliente, ciudad, provincia, total, ecommerce,
    pedido, convenio_orden, recuperado, est_orden, orden_vigente, responsable_orden, sucursal_remision, id_remision,
    rem_fecha, rem_centro, rem_centro_nombre, rem_convenio, rem_convenio_nombre, rem_vigente, rem_responsable, id_guia, guia,
    rem_dropshipping, centro_orden, documento, telefono, direccion, pais_id, provincia_id, ciudad_id, subtotal, impuestos,
    observacion, cliente_id)
  select cuenta, sucursal, id, fecha_orden, cliente, ciudad, provincia, total, ecommerce, pedido, convenio_orden,
    recuperado, est_orden, orden_vigente, responsable_orden, sucursal_remision, id_remision, rem_fecha, rem_centro,
    rem_centro_nombre, rem_convenio, rem_convenio_nombre, rem_vigente, rem_responsable, id_guia, guia, rem_dropshipping,
    centro_orden, documento, telefono, direccion, pais_id, provincia_id, ciudad_id, subtotal, impuestos, observacion, cliente_id
  from filas
  on conflict (cuenta, sucursal, id) do update set
    fecha_orden = excluded.fecha_orden, cliente = excluded.cliente, ciudad = excluded.ciudad,
    provincia = excluded.provincia, total = excluded.total, ecommerce = excluded.ecommerce, pedido = excluded.pedido,
    convenio_orden = excluded.convenio_orden, recuperado = excluded.recuperado, est_orden = excluded.est_orden,
    orden_vigente = excluded.orden_vigente, responsable_orden = excluded.responsable_orden,
    sucursal_remision = excluded.sucursal_remision, id_remision = excluded.id_remision,
    rem_fecha = coalesce(excluded.rem_fecha, a.rem_fecha), rem_centro = coalesce(excluded.rem_centro, a.rem_centro),
    rem_centro_nombre = coalesce(excluded.rem_centro_nombre, a.rem_centro_nombre),
    rem_convenio = coalesce(excluded.rem_convenio, a.rem_convenio),
    rem_convenio_nombre = coalesce(excluded.rem_convenio_nombre, a.rem_convenio_nombre),
    rem_vigente = coalesce(excluded.rem_vigente, a.rem_vigente),
    rem_responsable = coalesce(excluded.rem_responsable, a.rem_responsable),
    id_guia = coalesce(excluded.id_guia, a.id_guia), guia = coalesce(excluded.guia, a.guia),
    rem_dropshipping = coalesce(excluded.rem_dropshipping, a.rem_dropshipping),
    centro_orden = coalesce(excluded.centro_orden, a.centro_orden), documento = coalesce(excluded.documento, a.documento),
    telefono = coalesce(excluded.telefono, a.telefono), direccion = coalesce(excluded.direccion, a.direccion),
    pais_id = coalesce(excluded.pais_id, a.pais_id), provincia_id = coalesce(excluded.provincia_id, a.provincia_id),
    ciudad_id = coalesce(excluded.ciudad_id, a.ciudad_id), subtotal = coalesce(excluded.subtotal, a.subtotal),
    impuestos = coalesce(excluded.impuestos, a.impuestos), observacion = coalesce(excluded.observacion, a.observacion),
    cliente_id = coalesce(excluded.cliente_id, a.cliente_id),
    actualizado_en = now()
  where (a.fecha_orden, a.cliente, a.total, a.convenio_orden, a.est_orden, a.orden_vigente, a.id_remision,
         a.rem_centro, a.rem_convenio, a.rem_vigente, a.id_guia, a.guia, a.rem_dropshipping,
         a.centro_orden, a.telefono, a.direccion, a.ciudad_id, a.subtotal, a.impuestos, a.documento)
    is distinct from
        (excluded.fecha_orden, excluded.cliente, excluded.total, excluded.convenio_orden, excluded.est_orden,
         excluded.orden_vigente, excluded.id_remision, coalesce(excluded.rem_centro, a.rem_centro),
         coalesce(excluded.rem_convenio, a.rem_convenio), coalesce(excluded.rem_vigente, a.rem_vigente),
         coalesce(excluded.id_guia, a.id_guia), coalesce(excluded.guia, a.guia),
         coalesce(excluded.rem_dropshipping, a.rem_dropshipping),
         coalesce(excluded.centro_orden, a.centro_orden), coalesce(excluded.telefono, a.telefono),
         coalesce(excluded.direccion, a.direccion), coalesce(excluded.ciudad_id, a.ciudad_id),
         coalesce(excluded.subtotal, a.subtotal), coalesce(excluded.impuestos, a.impuestos),
         coalesce(excluded.documento, a.documento));
  get diagnostics n = row_count;
  update public.auto_config set ultima_corrida = now(), ultimo_error = null where cuenta = p_cuenta;
  return n;
end $$;

-- 2) La lista del agente devuelve también esos datos y los productos (se agregan claves a la función que ya existe).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.auto_lista'::regproc);
  if position('''centro_orden''' in d) = 0 then
    d := replace(d, '''pedido'', pedido,',
      '''pedido'', pedido, ''centro_orden'', centro_orden, ''documento'', documento, ''telefono'', telefono, ''direccion'', direccion, '
      || '''subtotal'', subtotal, ''impuestos'', impuestos, ''est_orden'', est_orden, ''articulos'', articulos, '
      || '''recaudo'', case when observacion ~* ''sin recaudo'' then false when observacion ~* ''con recaudo'' then true end, '
      || '''tiene_ubicacion'', ciudad_id is not null,');
    execute d;
  end if;
end $$;

-- 3) % de entrega por ciudad y transportadora con las guías propias de las tiendas del país (últimos 120 días, solo las
-- que ya terminaron: entregada o devolución). Se recalcula cada hora; la pantalla solo la lee.
create table if not exists public.auto_entrega_ciudad (
  pais text not null,
  ciudad_clave text not null,           -- auto_norm(ciudad) | auto_norm(departamento)
  transportadora integer not null,
  nombre text,
  entregadas integer not null,
  devoluciones integer not null,
  actualizado_en timestamptz not null default now(),
  primary key (pais, ciudad_clave, transportadora)
);
alter table public.auto_entrega_ciudad enable row level security;

create or replace function public.auto_entrega_ciudad_recalcular() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.auto_entrega_ciudad;
  insert into public.auto_entrega_ciudad (pais, ciudad_clave, transportadora, nombre, entregadas, devoluciones)
  select a.pais, public.auto_norm(g.nombre_ciudad_destinatario) || '|' || public.auto_norm(g.nombre_provincia_destinatario),
    g.transportadora_efficommerce, max(split_part(coalesce(g.nombre_transportadora_efficommerce, g.nombre_transportadora), '|', 1)),
    count(*) filter (where g.est_guia_efficommerce = 4), count(*) filter (where g.est_guia_efficommerce = 5)
  from public.effi_guias g
  join public.effi_accounts a on a.slug = g.cuenta and a.tipo = 'tienda'
  where g.fecha_trans >= now() - interval '120 days' and g.est_guia_efficommerce in (4, 5)
    and g.transportadora_efficommerce is not null and g.nombre_ciudad_destinatario is not null
  group by 1, 2, 3;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.auto_entrega_ciudad_recalcular() from public, anon, authenticated;
select public.auto_entrega_ciudad_recalcular();
select cron.schedule('auto-entrega-ciudad', '23 * * * *', $$ select public.auto_entrega_ciudad_recalcular(); $$);

-- 4) Huella por teléfono rápida: índice por los últimos 8 dígitos del teléfono de la guía.
create or replace function public.tel8(t text) returns text language sql immutable parallel safe set search_path = '' as $$
  select nullif(right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 8), '');
$$;
create index if not exists effi_guias_tel8 on public.effi_guias (public.tel8(telefonos_destinatario));

-- 5) Lo extra de las órdenes abiertas (sin remisión o sin guía, de los últimos días): historial del cliente y
-- transportadoras de la ciudad. Una consulta por pantalla, no una por orden.
create or replace function public.auto_ordenes_extra(p_cuenta text, p_dias integer default 3) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ok as (select p_cuenta = any (public.app_cuentas_visibles('automatizacion')) as ok),
  pais as (select pais from public.effi_accounts where slug = p_cuenta),
  o as (
    select x.sucursal, x.id, public.tel8(x.telefono) as tel, public.auto_norm(x.ciudad) || '|' || public.auto_norm(x.provincia) as clave
    from public.auto_ordenes x
    where x.cuenta = p_cuenta and (select ok from ok) and x.fecha_orden >= now() - make_interval(days => greatest(1, least(p_dias, 30)))
      and (x.id_remision is null or x.guia is null)
  ),
  tels as (select distinct tel from o where tel is not null and length(tel) = 8),
  g as (
    select t.tel,
      count(*) filter (where x.est_guia_efficommerce = 4) as entregadas,
      count(*) filter (where x.est_guia_efficommerce = 5) as devoluciones,
      count(*) filter (where x.est_guia_efficommerce not in (4, 5) and x.vigente is not false) as en_curso,
      max(x.fecha_trans) as ultima
    from tels t
    join public.effi_guias x on public.tel8(x.telefonos_destinatario) = t.tel
    join public.effi_accounts a on a.slug = x.cuenta and a.tipo = 'tienda' and a.pais = (select pais from pais)
    group by t.tel
  ),
  h as (
    select t.tel, jsonb_strip_nulls(jsonb_build_object(
      'entregadas', coalesce(g.entregadas, 0) + coalesce(m.entregadas, 0),
      'devoluciones', coalesce(g.devoluciones, 0) + coalesce(m.devoluciones, 0),
      'en_curso', coalesce(g.en_curso, 0), 'ultima', g.ultima,
      'propias', case when g.tel is not null then jsonb_build_object('entregadas', g.entregadas, 'devoluciones', g.devoluciones) end,
      'matriz', case when m.telefono is not null then jsonb_build_object('total', m.total, 'entregadas', m.entregadas, 'devoluciones', m.devoluciones) end)) as huella
    from tels t
    left join g on g.tel = t.tel
    left join public.huella_matriz m on m.pais = (select pais from pais) and m.telefono = t.tel
  ),
  tr as (
    select e.ciudad_clave, jsonb_agg(jsonb_build_object('id', e.transportadora, 'nombre', e.nombre, 'entregadas', e.entregadas,
      'devoluciones', e.devoluciones) order by e.entregadas + e.devoluciones desc) as lista
    from public.auto_entrega_ciudad e
    where e.pais = (select pais from pais) and e.ciudad_clave in (select clave from o)
    group by e.ciudad_clave
  )
  select coalesce(jsonb_object_agg(o.sucursal || '-' || o.id, jsonb_build_object(
    'huella', (select huella from h where h.tel = o.tel),
    'transportadoras', coalesce((select lista from tr where tr.ciudad_clave = o.clave), '[]'::jsonb))), '{}'::jsonb)
  from o;
$$;
revoke all on function public.auto_ordenes_extra(text, integer) from public, anon;
grant execute on function public.auto_ordenes_extra(text, integer) to authenticated;

grant execute on function public.auto_entrega_ciudad_recalcular() to service_role;
