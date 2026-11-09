-- 🇭🇳 🇸🇻 A un clic Honduras y El Salvador: carga de Drop (órdenes y billetera) e icomfly (trazabilidad de pedidos), con las
-- reglas del skill "a-un-clic-honduras-el-salvador-drop" (aprobado por el dueño el 9-nov-2026).
-- Drop se comporta como Dropi, así que va a las mismas tablas (dropi_ordenes, dropi_cartera, dropi_orden_productos) a
-- nombre de AUNCLIC_HN / AUNCLIC_SV: v_dropi_ordenes (la billetera manda), Productos, PyG, despacho y pendientes
-- funcionan sin cambios. No se guardan nombre, teléfono ni dirección del cliente: solo una huella del nombre.

alter table public.dropi_ordenes add column if not exists cliente_hash text;

-- Trazabilidad de icomfly: la única fuente del producto de cada orden de Drop.
create table if not exists public.icomfly_pedidos (
  cuenta text not null references public.effi_accounts (slug),
  id text not null,                 -- "#8711"
  linea integer not null,           -- un pedido "1x A, 1x B" son dos líneas
  fecha date, hora text, origen text, plataforma_envio text, departamento text, municipio text,
  producto text, cantidad numeric, total numeric, recaudo text, pasarela text, costo_producto numeric, costo_envio numeric,
  estado text, guia text, transportadora text, etiquetas text, motivo_cancelacion text, fecha_cancelacion date,
  cliente_hash text,
  carga_id bigint references public.app_cargas (id) on delete set null,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, id, linea)
);
create index if not exists icomfly_pedidos_guia on public.icomfly_pedidos (cuenta, guia);
alter table public.icomfly_pedidos enable row level security;
create index if not exists dropi_ordenes_guia on public.dropi_ordenes (cuenta, guia);

-- Lempiras por dólar (de la columna "Tasa de cambio (USD)" de la billetera de Drop; provisional hasta la TRM real).
alter table public.app_trm_dia add column if not exists usd_hnl numeric;

create or replace function public.app_cargar(p_tipo text, p_cuenta text, p_archivo text, p_filas jsonb, p_carga bigint default null, p_resumen jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_carga bigint := p_carga;
  v_n integer := jsonb_array_length(p_filas);
  v_omitidas integer := 0;
begin
  if not public.app_es_owner() then
    raise exception 'Solo el dueño puede cargar archivos';
  end if;
  if (p_tipo like 'dropi_%' or p_tipo like 'drop_%' or p_tipo like 'icomfly_%') and not exists (select 1 from public.effi_accounts where slug = p_cuenta) then
    raise exception 'Cuenta inválida: %', p_cuenta;
  end if;
  if v_carga is null then
    insert into public.app_cargas (tipo, cuenta, archivo, resumen) values (p_tipo, p_cuenta, p_archivo, p_resumen) returning id into v_carga;
  end if;

  if p_tipo = 'dropi_ordenes' then
    insert into public.dropi_ordenes as d (cuenta, id, fecha, hora, guia, estatus, tipo_envio, departamento, ciudad, transportadora, venta, ganancia, flete,
      flete_dev, comision, costo, novedad, novedad_solucionada, ultimo_movimiento, fecha_ultimo_movimiento, tipo_tienda, tienda, id_orden_tienda,
      fecha_guia, recuperado, categorias, fecha_cancelacion, cancelado_por, motivo_cancelacion, fecha_reporte, carga_id)
    select p_cuenta, r.id, r.fecha, r.hora, r.guia, r.estatus, r.tipo_envio, r.departamento, r.ciudad, r.transportadora, r.venta, r.ganancia, r.flete,
      r.flete_dev, r.comision, r.costo, r.novedad, r.novedad_solucionada, r.ultimo_movimiento, r.fecha_ultimo_movimiento, r.tipo_tienda, r.tienda,
      r.id_orden_tienda, r.fecha_guia, coalesce(r.recuperado, false), r.categorias, r.fecha_cancelacion, r.cancelado_por, r.motivo_cancelacion, r.fecha_reporte, v_carga
    from jsonb_to_recordset(p_filas) as r(id bigint, fecha date, hora text, guia text, estatus text, tipo_envio text, departamento text, ciudad text,
      transportadora text, venta numeric, ganancia numeric, flete numeric, flete_dev numeric, comision numeric, costo numeric, novedad text,
      novedad_solucionada boolean, ultimo_movimiento text, fecha_ultimo_movimiento date, tipo_tienda text, tienda text, id_orden_tienda text,
      fecha_guia date, recuperado boolean, categorias text, fecha_cancelacion date, cancelado_por text, motivo_cancelacion text, fecha_reporte date)
    on conflict (cuenta, id) do update set fecha = excluded.fecha, hora = excluded.hora, guia = excluded.guia, estatus = excluded.estatus,
      tipo_envio = excluded.tipo_envio, departamento = excluded.departamento, ciudad = excluded.ciudad, transportadora = excluded.transportadora,
      venta = excluded.venta, ganancia = excluded.ganancia, flete = excluded.flete, flete_dev = excluded.flete_dev, comision = excluded.comision,
      costo = excluded.costo, novedad = excluded.novedad, novedad_solucionada = excluded.novedad_solucionada,
      ultimo_movimiento = excluded.ultimo_movimiento, fecha_ultimo_movimiento = excluded.fecha_ultimo_movimiento, tipo_tienda = excluded.tipo_tienda,
      tienda = excluded.tienda, id_orden_tienda = excluded.id_orden_tienda, fecha_guia = excluded.fecha_guia, recuperado = excluded.recuperado,
      categorias = excluded.categorias, fecha_cancelacion = excluded.fecha_cancelacion, cancelado_por = excluded.cancelado_por,
      motivo_cancelacion = excluded.motivo_cancelacion, fecha_reporte = excluded.fecha_reporte, carga_id = excluded.carga_id, actualizado_en = now()
    where d.fecha_reporte is null or excluded.fecha_reporte is null or excluded.fecha_reporte >= d.fecha_reporte;

  elsif p_tipo = 'dropi_productos' then
    delete from public.dropi_orden_productos p
    where p.cuenta = p_cuenta and p.orden_id in (select (e ->> 'orden_id')::bigint from jsonb_array_elements(p_filas) e)
      and (p_carga is null or p.carga_id is distinct from v_carga);
    insert into public.dropi_orden_productos (cuenta, orden_id, linea, producto_id, variacion_id, sku, producto, variacion, cantidad, precio_proveedor, precio_proveedor_total, carga_id)
    select p_cuenta, r.orden_id, r.linea, r.producto_id, r.variacion_id, r.sku, r.producto, r.variacion, r.cantidad, r.precio_proveedor, r.precio_proveedor_total, v_carga
    from jsonb_to_recordset(p_filas) as r(orden_id bigint, linea integer, producto_id bigint, variacion_id bigint, sku text, producto text, variacion text,
      cantidad numeric, precio_proveedor numeric, precio_proveedor_total numeric)
    on conflict (cuenta, orden_id, linea) do update set producto_id = excluded.producto_id, variacion_id = excluded.variacion_id, sku = excluded.sku,
      producto = excluded.producto, variacion = excluded.variacion, cantidad = excluded.cantidad, precio_proveedor = excluded.precio_proveedor,
      precio_proveedor_total = excluded.precio_proveedor_total, carga_id = excluded.carga_id;

  elsif p_tipo = 'dropi_cartera' then
    insert into public.dropi_cartera (cuenta, id, fecha, tipo, monto, monto_previo, orden_id, guia, descripcion, concepto_retiro, carga_id)
    select p_cuenta, r.id, r.fecha, r.tipo, r.monto, r.monto_previo, r.orden_id, r.guia, r.descripcion, r.concepto_retiro, v_carga
    from jsonb_to_recordset(p_filas) as r(id bigint, fecha timestamp, tipo text, monto numeric, monto_previo numeric, orden_id bigint, guia text,
      descripcion text, concepto_retiro text)
    on conflict (cuenta, id) do update set fecha = excluded.fecha, tipo = excluded.tipo, monto = excluded.monto, monto_previo = excluded.monto_previo,
      orden_id = excluded.orden_id, guia = excluded.guia, descripcion = excluded.descripcion, concepto_retiro = excluded.concepto_retiro, carga_id = excluded.carga_id;

  -- Drop · Órdenes → dropi_ordenes. Departamento, ciudad y costo los pone drop_conciliar (de icomfly y la billetera).
  elsif p_tipo = 'drop_ordenes' then
    insert into public.dropi_ordenes as d (cuenta, id, fecha, hora, guia, estatus, tipo_envio, transportadora, venta, ultimo_movimiento,
      tipo_tienda, tienda, id_orden_tienda, categorias, cliente_hash, recuperado, carga_id)
    select p_cuenta, r.id, r.fecha, r.hora, r.guia, r.estatus, r.tipo_envio, r.transportadora, r.venta, r.ultimo_movimiento,
      r.tipo_tienda, r.tienda, r.id_orden_tienda, r.categorias, r.cliente_hash, false, v_carga
    from jsonb_to_recordset(p_filas) as r(id bigint, fecha date, hora text, guia text, estatus text, tipo_envio text, transportadora text,
      venta numeric, ultimo_movimiento text, tipo_tienda text, tienda text, id_orden_tienda text, categorias text, cliente_hash text)
    on conflict (cuenta, id) do update set fecha = excluded.fecha, hora = excluded.hora, guia = excluded.guia, estatus = excluded.estatus,
      tipo_envio = excluded.tipo_envio, transportadora = excluded.transportadora, venta = excluded.venta,
      ultimo_movimiento = excluded.ultimo_movimiento, tipo_tienda = excluded.tipo_tienda, tienda = excluded.tienda,
      id_orden_tienda = excluded.id_orden_tienda, categorias = excluded.categorias, cliente_hash = excluded.cliente_hash,
      carga_id = excluded.carga_id, actualizado_en = now();

  -- Drop · Billetera → dropi_cartera (la descripción al estilo Dropi da el concepto) + tasa de lempiras del día.
  elsif p_tipo = 'drop_billetera' then
    insert into public.dropi_cartera (cuenta, id, fecha, tipo, monto, monto_previo, orden_id, descripcion, concepto_retiro, carga_id)
    select p_cuenta, r.id, r.fecha, r.tipo, r.monto, r.monto_previo, r.orden_id, r.descripcion, r.concepto_retiro, v_carga
    from jsonb_to_recordset(p_filas) as r(id bigint, fecha timestamp, tipo text, monto numeric, monto_previo numeric, orden_id bigint,
      descripcion text, concepto_retiro text)
    on conflict (cuenta, id) do update set fecha = excluded.fecha, tipo = excluded.tipo, monto = excluded.monto, monto_previo = excluded.monto_previo,
      orden_id = excluded.orden_id, descripcion = excluded.descripcion, concepto_retiro = excluded.concepto_retiro, carga_id = excluded.carga_id;
    if (select pais from public.effi_accounts where slug = p_cuenta) = 'HN' then
      update public.app_trm_dia t set usd_hnl = x.hnl
      from (select r.fecha::date as dia, avg(1 / r.tasa) as hnl
            from jsonb_to_recordset(p_filas) as r(fecha timestamp, tasa numeric) where r.tasa > 0 group by 1) x
      where t.fecha = x.dia;
    end if;

  -- icomfly · Pedidos → icomfly_pedidos (se cruza con las órdenes en drop_conciliar).
  elsif p_tipo = 'icomfly_pedidos' then
    insert into public.icomfly_pedidos as d (cuenta, id, linea, fecha, hora, origen, plataforma_envio, departamento, municipio, producto, cantidad,
      total, recaudo, pasarela, costo_producto, costo_envio, estado, guia, transportadora, etiquetas, motivo_cancelacion, fecha_cancelacion,
      cliente_hash, carga_id)
    select p_cuenta, r.id, r.linea, r.fecha, r.hora, r.origen, r.plataforma_envio, r.departamento, r.municipio, r.producto, r.cantidad,
      r.total, r.recaudo, r.pasarela, r.costo_producto, r.costo_envio, r.estado, r.guia, r.transportadora, r.etiquetas, r.motivo_cancelacion,
      r.fecha_cancelacion, r.cliente_hash, v_carga
    from jsonb_to_recordset(p_filas) as r(id text, linea integer, fecha date, hora text, origen text, plataforma_envio text, departamento text,
      municipio text, producto text, cantidad numeric, total numeric, recaudo text, pasarela text, costo_producto numeric, costo_envio numeric,
      estado text, guia text, transportadora text, etiquetas text, motivo_cancelacion text, fecha_cancelacion date, cliente_hash text)
    on conflict (cuenta, id, linea) do update set fecha = excluded.fecha, hora = excluded.hora, origen = excluded.origen,
      plataforma_envio = excluded.plataforma_envio, departamento = excluded.departamento, municipio = excluded.municipio,
      producto = excluded.producto, cantidad = excluded.cantidad, total = excluded.total, recaudo = excluded.recaudo,
      pasarela = excluded.pasarela, costo_producto = excluded.costo_producto, costo_envio = excluded.costo_envio, estado = excluded.estado,
      guia = excluded.guia, transportadora = excluded.transportadora, etiquetas = excluded.etiquetas,
      motivo_cancelacion = excluded.motivo_cancelacion, fecha_cancelacion = excluded.fecha_cancelacion, cliente_hash = excluded.cliente_hash,
      carga_id = excluded.carga_id, actualizado_en = now();

  elsif p_tipo = 'meta_bm' then
    drop table if exists pg_temp._meta;
    create temp table _meta on commit drop as
    select a.slug as cuenta, r.fecha, r.cuenta_ads, r.campana, sum(r.monto_cop) as monto_cop
    from jsonb_to_recordset(p_filas) as r(pais text, fecha date, cuenta_ads text, campana text, monto_cop numeric)
    join public.effi_accounts a on a.pais = r.pais and a.tipo = 'tienda' and a.sociedad = 'Joalix AA Group'
    group by 1, 2, 3, 4;
    v_omitidas := v_n - (select count(*) from jsonb_to_recordset(p_filas) as r(pais text) join public.effi_accounts a on a.pais = r.pais and a.tipo = 'tienda' and a.sociedad = 'Joalix AA Group');

    insert into public.app_publicidad_campanas as c (cuenta, fecha, cuenta_ads, campana, monto_cop, carga_id)
    select cuenta, fecha, cuenta_ads, campana, monto_cop, v_carga from pg_temp._meta
    on conflict (cuenta, fecha, cuenta_ads, campana) do update set monto_cop = excluded.monto_cop, carga_id = excluded.carga_id, actualizado_en = now();

    delete from public.app_publicidad_diaria d
    using (select distinct cuenta, fecha, cuenta_ads from pg_temp._meta) t
    where d.cuenta = t.cuenta and d.fecha = t.fecha and d.cuenta_ads = t.cuenta_ads;
    insert into public.app_publicidad_diaria (cuenta, fecha, cuenta_ads, monto_cop)
    select c.cuenta, c.fecha, c.cuenta_ads, sum(c.monto_cop)
    from public.app_publicidad_campanas c
    join (select distinct cuenta, fecha, cuenta_ads from pg_temp._meta) t using (cuenta, fecha, cuenta_ads)
    group by 1, 2, 3;
  else
    raise exception 'Tipo de carga desconocido: %', p_tipo;
  end if;

  update public.app_cargas set filas = filas + v_n - v_omitidas where id = v_carga;
  return jsonb_build_object('carga', v_carga, 'filas', v_n - v_omitidas, 'omitidas', v_omitidas);
end $$;

-- Conciliación Drop + icomfly de una tienda (se llama al terminar de cargar):
--   1. producto: cada pedido de icomfly se cruza con una orden de Drop por guía exacta; si no, por huella del cliente +
--      monto; si no, por huella del cliente + fecha ±1 día. Llena dropi_orden_productos (sku "icomfly:#id"), departamento
--      y ciudad.
--   2. costo + flete = venta − abono (no se desglosa): ganancia = abono de la billetera.
--   3. Devuelve el resumen del skill: estados, entregadas, devoluciones, ventas, ganancia, saldo, retiros, sin producto.
create or replace function public.drop_conciliar(p_cuenta text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_res jsonb;
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño puede conciliar'; end if;

  drop table if exists pg_temp._ped; drop table if exists pg_temp._ord; drop table if exists pg_temp._map;
  create temp table _ped on commit drop as
    select distinct on (id) id, guia, cliente_hash, total, fecha, departamento, municipio
    from public.icomfly_pedidos where cuenta = p_cuenta order by id, linea;
  create temp table _ord on commit drop as
    select id, guia, cliente_hash, venta, fecha from public.dropi_ordenes where cuenta = p_cuenta and tienda = 'drop';
  create temp table _map (pid text primary key, oid bigint unique, via text) on commit drop;

  insert into _map select distinct on (o.id) p.id, o.id, 'guia'
    from _ped p join _ord o on o.guia = p.guia where p.guia is not null order by o.id, p.fecha desc on conflict do nothing;
  insert into _map select distinct on (o.id) p.id, o.id, 'nombre_monto'
    from _ped p join _ord o on o.cliente_hash = p.cliente_hash and o.venta = p.total
    where p.cliente_hash is not null and p.id not in (select pid from _map) and o.id not in (select oid from _map)
    order by o.id, abs(o.fecha - p.fecha) on conflict do nothing;
  insert into _map select distinct on (o.id) p.id, o.id, 'nombre_fecha'
    from _ped p join _ord o on o.cliente_hash = p.cliente_hash and abs(o.fecha - p.fecha) <= 1
    where p.cliente_hash is not null and p.id not in (select pid from _map) and o.id not in (select oid from _map)
    order by o.id, abs(o.fecha - p.fecha) on conflict do nothing;

  delete from public.dropi_orden_productos where cuenta = p_cuenta and sku like 'icomfly:%';
  insert into public.dropi_orden_productos (cuenta, orden_id, linea, sku, producto, cantidad)
  select p_cuenta, m.oid, row_number() over (partition by m.oid order by l.linea), 'icomfly:' || l.id, l.producto, l.cantidad
  from _map m join public.icomfly_pedidos l on l.cuenta = p_cuenta and l.id = m.pid
  where l.producto is not null;

  update public.dropi_ordenes o set departamento = p.departamento, ciudad = p.municipio
  from _map m join _ped p on p.id = m.pid
  where o.cuenta = p_cuenta and o.id = m.oid;

  update public.dropi_ordenes o set costo = case when w.g is null then null else o.venta - w.g end, flete = 0, comision = 0
  from (select o2.id, (select sum(c.valor) from public.dropi_cartera c where c.cuenta = p_cuenta and c.orden_id = o2.id and c.concepto = 'ganancia') as g
        from public.dropi_ordenes o2 where o2.cuenta = p_cuenta and o2.tienda = 'drop') w
  where o.cuenta = p_cuenta and o.id = w.id;

  select jsonb_build_object(
    'ordenes', (select count(*) from public.v_dropi_ordenes v where v.cuenta = p_cuenta and v.tienda = 'drop' and v.estado_u <> 'EXCLUIDA'),
    'por_estado', (select coalesce(jsonb_object_agg(e, n), '{}'::jsonb) from (select v.estado_u as e, count(*) as n from public.v_dropi_ordenes v
                   where v.cuenta = p_cuenta and v.tienda = 'drop' group by 1) x),
    'entregadas', (select count(*) from public.v_dropi_ordenes v where v.cuenta = p_cuenta and v.tienda = 'drop' and v.estado_u = 'ENTREGADO'),
    'devoluciones', (select count(*) from public.v_dropi_ordenes v where v.cuenta = p_cuenta and v.tienda = 'drop' and v.estado_u = 'DEVOLUCION'),
    'ventas', (select coalesce(round(sum(v.venta), 2), 0) from public.v_dropi_ordenes v where v.cuenta = p_cuenta and v.tienda = 'drop' and v.ganancia_cartera is not null),
    'ganancia', (select coalesce(round(sum(c.valor), 2), 0) from public.dropi_cartera c where c.cuenta = p_cuenta and c.concepto = 'ganancia'),
    'saldo', (select round(c.monto_previo + c.valor, 2) from public.dropi_cartera c where c.cuenta = p_cuenta order by c.fecha desc, c.id desc limit 1),
    'retiros', (select coalesce(jsonb_agg(jsonb_build_object('fecha', c.fecha, 'concepto', c.concepto_retiro, 'monto', -c.valor) order by c.fecha), '[]'::jsonb)
                from public.dropi_cartera c where c.cuenta = p_cuenta and c.concepto = 'retiro'),
    'producto', jsonb_build_object(
      'guia', (select count(*) from _map where via = 'guia'),
      'nombre_monto', (select count(*) from _map where via = 'nombre_monto'),
      'nombre_fecha', (select count(*) from _map where via = 'nombre_fecha'),
      'sin_producto', (select count(*) from public.v_dropi_ordenes v where v.cuenta = p_cuenta and v.tienda = 'drop' and v.estado_u <> 'EXCLUIDA'
                       and v.id not in (select oid from _map)),
      'ejemplos_sin', (select coalesce(jsonb_agg(x.g), '[]'::jsonb) from (select coalesce(v.guia, v.id::text) as g from public.v_dropi_ordenes v
                       where v.cuenta = p_cuenta and v.tienda = 'drop' and v.estado_u <> 'EXCLUIDA' and v.id not in (select oid from _map)
                       order by v.fecha desc limit 5) x)),
    'billetera_sin_orden', (select count(*) from public.dropi_cartera c where c.cuenta = p_cuenta and c.orden_id is not null
                            and not exists (select 1 from public.dropi_ordenes o where o.cuenta = c.cuenta and o.id = c.orden_id))
  ) into v_res;
  return v_res;
end $$;
revoke all on function public.drop_conciliar(text) from public, anon;
grant execute on function public.drop_conciliar(text) to authenticated;

-- Verificador de tienda: también por guía (archivos de icomfly, que no traen número de orden de Drop).
drop function if exists public.dropi_verificar(text[], bigint[]);
create or replace function public.dropi_verificar(p_tiendas text[], p_ordenes bigint[], p_guias text[] default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.app_es_owner() then '{}'::jsonb else jsonb_build_object(
    'tiendas', coalesce((select jsonb_object_agg(t.tienda, t.cuentas) from (
        select o.tienda, jsonb_agg(distinct o.cuenta) as cuentas
        from public.dropi_ordenes o where o.tienda = any (coalesce(p_tiendas, '{}')) group by 1) t), '{}'::jsonb),
    'ordenes', coalesce((select jsonb_object_agg(x.cuenta, x.n) from (
        select o.cuenta, count(*) as n from public.dropi_ordenes o
        where o.id = any (coalesce(p_ordenes, '{}')) group by 1) x), '{}'::jsonb),
    'guias', coalesce((select jsonb_object_agg(x.cuenta, x.n) from (
        select o.cuenta, count(*) as n from public.dropi_ordenes o
        where o.guia = any (coalesce(p_guias, '{}')) group by 1) x), '{}'::jsonb)
  ) end;
$$;
revoke all on function public.dropi_verificar(text[], bigint[], text[]) from public, anon;
grant execute on function public.dropi_verificar(text[], bigint[], text[]) to authenticated;

-- Honduras en lempiras: COP → USD (TRM) → HNL (tasa de la billetera de Drop, provisional).
update public.effi_accounts set divisa = 'HNL' where slug = 'AUNCLIC_HN';

create or replace function public.app_cop_a_local(p_cuenta text, p_cop numeric, p_mes date) returns numeric
language sql stable set search_path = '' as $$
  select case
    when p_cuenta = 'TIENDA_CO' then p_cop
    when p_cuenta = 'TIENDA_CR' then (
      select p_cop / avg(d.usd_cop) * avg(d.usd_crc)
      from public.app_trm_dia d
      where d.usd_crc is not null and d.fecha between
        coalesce((select min(x.fecha) from public.app_trm_dia x where x.fecha >= p_mes and x.fecha < p_mes + interval '1 month' and x.usd_crc is not null),
                 (select max(x.fecha) from public.app_trm_dia x where x.fecha < p_mes and x.usd_crc is not null))
        and coalesce((select max(x.fecha) from public.app_trm_dia x where x.fecha >= p_mes and x.fecha < p_mes + interval '1 month' and x.usd_crc is not null),
                 (select max(x.fecha) from public.app_trm_dia x where x.fecha < p_mes and x.usd_crc is not null)))
    when p_cuenta = 'AUNCLIC_HN' then (
      select p_cop / avg(d.usd_cop) * coalesce(
        (select avg(x.usd_hnl) from public.app_trm_dia x where x.fecha >= p_mes and x.fecha < p_mes + interval '1 month' and x.usd_hnl is not null),
        (select x.usd_hnl from public.app_trm_dia x where x.usd_hnl is not null order by abs(x.fecha - p_mes) limit 1))
      from public.app_trm_dia d where d.fecha >= p_mes and d.fecha < p_mes + interval '1 month' and d.usd_cop is not null)
    when t.mes is null then null
    when p_cuenta in ('TIENDA_GT', 'AUNCLIC_GT', 'VALKA_GT') then p_cop / t.gtq_cop
    when p_cuenta in ('TIENDA_EC', 'AUNCLIC_SV') then p_cop / t.usd_cop
  end
  from (select 1) uno
  left join lateral (
    select * from public.app_trm_mes where mes <= p_mes order by mes desc limit 1
  ) t on true;
$$;

create or replace function public.app_cop_a_local_dia(p_cuenta text, p_cop numeric, p_fecha date) returns numeric
language sql stable security definer set search_path = '' as $$
  with t as (select usd_cop, usd_gtq, usd_crc from public.app_trm_dia where fecha <= p_fecha order by fecha desc limit 1),
  h as (select usd_hnl from public.app_trm_dia where usd_hnl is not null order by abs(fecha - p_fecha) limit 1),
  a as (select pais from public.effi_accounts where slug = p_cuenta)
  select case (select pais from a)
    when 'CO' then p_cop
    when 'EC' then p_cop / nullif((select usd_cop from t), 0)
    when 'SV' then p_cop / nullif((select usd_cop from t), 0)
    when 'HN' then p_cop / nullif((select usd_cop from t), 0) * (select usd_hnl from h)
    when 'GT' then p_cop / nullif((select usd_cop from t), 0) * (select usd_gtq from t)
    when 'CR' then p_cop / nullif((select usd_cop from t), 0) * (select usd_crc from t)
  end;
$$;

-- Campañas de A un clic (skill): "(HN) EXTENSOR DE GRIFO" es la llave de grifo; "RESPIGO" es un test.
insert into public.prod_campana_reglas (cuenta, patron, producto, prioridad)
select v.* from (values
  ('AUNCLIC_HN', 'EXTENSOR DE GRIFO|EXTENCION DE GRIFO|LLAVE GRIFO', 'Llave Grifo Rotacion 1080° Grados', 10),
  ('AUNCLIC_HN', 'RESPIGO', 'Test', 10),
  ('AUNCLIC_GT', 'RESPIGO', 'Test', 10),
  ('AUNCLIC_SV', 'RESPIGO', 'Test', 10)
) v(cuenta, patron, producto, prioridad)
where not exists (select 1 from public.prod_campana_reglas r where r.cuenta = v.cuenta and r.patron = v.patron);

-- Nombres de producto de icomfly que son el mismo (Honduras).
insert into public.prod_alias (cuenta, patron, producto, prioridad)
select v.* from (values
  ('AUNCLIC_HN', 'MELAXIN', 'Dr. Melaxin Peel Shot', 40),
  ('AUNCLIC_HN', 'APOLO', 'Bálsamo Estimulante de Barba Apolo', 40),
  ('AUNCLIC_HN', 'POWER SAVE', 'Power Saver Caja Ahorradora de Energía', 40)
) v(cuenta, patron, producto, prioridad)
where not exists (select 1 from public.prod_alias a where a.cuenta = v.cuenta and a.patron = v.patron);

-- El historial de cargas acepta los tipos nuevos.
alter table public.app_cargas drop constraint if exists app_cargas_tipo_check;
alter table public.app_cargas add constraint app_cargas_tipo_check
  check (tipo = any (array['dropi_ordenes', 'dropi_productos', 'dropi_cartera', 'meta_bm', 'drop_ordenes', 'drop_billetera', 'icomfly_pedidos']));
