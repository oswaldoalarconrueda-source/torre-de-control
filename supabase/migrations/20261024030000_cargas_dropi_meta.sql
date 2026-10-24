-- Cargas por archivo mientras no hay API: Dropi (órdenes, órdenes por producto, historial de cartera)
-- y Meta (CSV por Business Manager). Los archivos se leen en el navegador; aquí solo llega lo necesario
-- (sin nombre, teléfono, correo ni dirección del cliente).

create table public.app_cargas (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('dropi_ordenes', 'dropi_productos', 'dropi_cartera', 'meta_bm')),
  cuenta text references public.effi_accounts (slug),
  archivo text not null,
  filas integer not null default 0,
  resumen jsonb,
  usuario uuid default auth.uid(),
  creado_en timestamptz not null default now()
);
comment on table public.app_cargas is 'Bitácora de archivos cargados en la Torre (Dropi y Meta).';

create table public.dropi_ordenes (
  cuenta text not null references public.effi_accounts (slug),
  id bigint not null,
  fecha date not null,
  hora text,
  guia text,
  estatus text,
  tipo_envio text,
  departamento text,
  ciudad text,
  transportadora text,
  venta numeric,              -- VALOR DE COMPRA EN PRODUCTOS (lo que paga el cliente)
  ganancia numeric,
  flete numeric,              -- PRECIO FLETE
  flete_dev numeric,          -- COSTO DEVOLUCION FLETE (según el reporte; el real sale de la cartera)
  comision numeric,
  costo numeric,              -- TOTAL EN PRECIOS DE PROVEEDOR
  novedad text,
  novedad_solucionada boolean,
  ultimo_movimiento text,
  fecha_ultimo_movimiento date,
  tipo_tienda text,
  tienda text,
  id_orden_tienda text,
  fecha_guia date,
  recuperado boolean not null default false,   -- cliente que empieza con "*"
  categorias text,
  fecha_cancelacion date,
  cancelado_por text,
  motivo_cancelacion text,
  fecha_reporte date,
  carga_id bigint references public.app_cargas (id) on delete set null,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, id)
);
create index dropi_ordenes_fecha on public.dropi_ordenes (cuenta, fecha);
create index dropi_ordenes_guia on public.dropi_ordenes (cuenta, guia);

create table public.dropi_orden_productos (
  cuenta text not null references public.effi_accounts (slug),
  orden_id bigint not null,
  linea integer not null,
  producto_id bigint,
  variacion_id bigint,
  sku text,
  producto text,
  variacion text,
  cantidad numeric,
  precio_proveedor numeric,
  precio_proveedor_total numeric,
  carga_id bigint references public.app_cargas (id) on delete set null,
  primary key (cuenta, orden_id, linea)
);

create table public.dropi_cartera (
  cuenta text not null references public.effi_accounts (slug),
  id bigint not null,
  fecha timestamp not null,      -- hora local del país, como la trae Dropi
  tipo text not null,            -- ENTRADA / SALIDA
  monto numeric not null,
  monto_previo numeric,
  orden_id bigint,
  guia text,
  descripcion text,
  concepto_retiro text,
  concepto text generated always as (
    case
      when descripcion ilike 'ENTRADA POR GANANCIA%' then 'ganancia'
      when descripcion ilike 'SALIDA DE COBRO DE DEVOLUCI%' or descripcion ilike 'SALIDA POR COBRO DE FLETE INICIAL%' then 'flete_dev'
      when descripcion ilike 'DEVOLUCION DE DINERO POR GARANTIA%' or descripcion ilike 'ENTRADA POR CAMBIO DE ESTATUS%' then 'garantia_entrada'
      when descripcion ilike 'SALIDA POR NUEVA ORDEN%' then 'garantia_salida'
      when descripcion ilike 'SALIDA POR CORRECCION DE ESTADO%' then 'correccion'
      when descripcion ilike '%RETIRO%' then 'retiro'
      when descripcion ilike '%TRANSFERENCIA%' then 'transferencia'
      when descripcion ilike 'RECARGA DE WALLET%' then 'recarga'
      else 'otro'
    end) stored,
  valor numeric generated always as (case when tipo = 'SALIDA' then -monto else monto end) stored,
  carga_id bigint references public.app_cargas (id) on delete set null,
  primary key (cuenta, id)
);
create index dropi_cartera_orden on public.dropi_cartera (cuenta, orden_id);

create table public.app_publicidad_campanas (
  cuenta text not null references public.effi_accounts (slug),
  fecha date not null,
  cuenta_ads text not null,
  campana text not null,
  monto_cop numeric not null,
  carga_id bigint references public.app_cargas (id) on delete set null,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, fecha, cuenta_ads, campana)
);
comment on table public.app_publicidad_campanas is 'Gasto de Meta por día y campaña (CSV por BM). Alimenta app_publicidad_diaria.';

do $$
declare t text;
begin
  foreach t in array array['dropi_ordenes', 'dropi_orden_productos', 'dropi_cartera', 'app_publicidad_campanas', 'app_cargas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (cuenta = any ((select public.app_cuentas_visibles())::text[]) or (select public.app_es_owner()))', t || '_leer', t);
  end loop;
end $$;

-- Estado unificado de las órdenes Dropi. La cartera manda: si Dropi ya pagó la ganancia, es ENTREGADO;
-- si cobró flete de devolución y no pagó ganancia, es DEVOLUCION.
create view public.v_dropi_ordenes with (security_invoker = on) as
select o.*,
  w.ganancia as ganancia_cartera, w.flete_dev as flete_dev_cartera, w.otros as otros_cartera,
  case
    when w.ganancia is not null then 'ENTREGADO'
    when w.flete_dev is not null then 'DEVOLUCION'
    when o.estatus = 'ENTREGADO' then 'ENTREGADO'
    when o.estatus ilike 'DEVOLUCI%' then 'DEVOLUCION'
    when o.estatus in ('CANCELADO', 'RECHAZADO') then 'EXCLUIDA'
    when o.estatus ilike 'RECLAME EN OFICINA%' then 'EN_OFICINA'
    when o.estatus ilike '%NOVEDAD%' or o.estatus ilike 'INTENTO DE ENTREGA%' or o.estatus ilike 'INCIDENCIA%' then 'NOVEDAD'
    when o.estatus in ('PENDIENTE', 'PENDIENTE CONFIRMACION', 'GUIA_GENERADA', 'EN PROCESAMIENTO', 'TELEMERCADEO', 'PREPARADO PARA TRANSPORTADORA') then 'PENDIENTE'
    else 'EN_TRANSITO'
  end as estado_u
from public.dropi_ordenes o
left join lateral (
  select sum(c.valor) filter (where c.concepto = 'ganancia') as ganancia,
         -sum(c.valor) filter (where c.concepto = 'flete_dev') as flete_dev,
         sum(c.valor) filter (where c.concepto in ('garantia_entrada', 'garantia_salida', 'correccion', 'otro')) as otros
  from public.dropi_cartera c where c.cuenta = o.cuenta and c.orden_id = o.id
) w on true;

-- Carga de un bloque de filas ya normalizadas en el navegador. Se llama por partes (p_carga = id de la primera).
create function public.app_cargar(p_tipo text, p_cuenta text, p_archivo text, p_filas jsonb, p_carga bigint default null, p_resumen jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_carga bigint := p_carga;
  v_n integer := jsonb_array_length(p_filas);
  v_omitidas integer := 0;
begin
  if not public.app_es_owner() then
    raise exception 'Solo el dueño puede cargar archivos';
  end if;
  if p_tipo like 'dropi_%' and not exists (select 1 from public.effi_accounts where slug = p_cuenta) then
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
    -- Un reporte más viejo no pisa uno más nuevo de la misma orden.
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

  elsif p_tipo = 'meta_bm' then
    -- El país del CSV (país de entrega del anuncio) decide la tienda. Lo que no tenga tienda se omite y se informa.
    drop table if exists pg_temp._meta;
    create temp table _meta on commit drop as
    select a.slug as cuenta, r.fecha, r.cuenta_ads, r.campana, sum(r.monto_cop) as monto_cop
    from jsonb_to_recordset(p_filas) as r(pais text, fecha date, cuenta_ads text, campana text, monto_cop numeric)
    join public.effi_accounts a on a.pais = r.pais and a.tipo = 'tienda'
    group by 1, 2, 3, 4;
    v_omitidas := v_n - (select count(*) from jsonb_to_recordset(p_filas) as r(pais text) join public.effi_accounts a on a.pais = r.pais and a.tipo = 'tienda');

    insert into public.app_publicidad_campanas as c (cuenta, fecha, cuenta_ads, campana, monto_cop, carga_id)
    select cuenta, fecha, cuenta_ads, campana, monto_cop, v_carga from pg_temp._meta
    on conflict (cuenta, fecha, cuenta_ads, campana) do update set monto_cop = excluded.monto_cop, carga_id = excluded.carga_id, actualizado_en = now();

    -- El total diario por cuenta publicitaria se rehace con todas sus campañas.
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
revoke all on function public.app_cargar(text, text, text, jsonb, bigint, jsonb) from public, anon;
grant execute on function public.app_cargar(text, text, text, jsonb, bigint, jsonb) to authenticated;

-- Qué hay cargado por tienda y fuente (pantalla 📤 Cargar archivos).
create function public.app_estado_cargas()
returns table (cuenta text, fuente text, filas bigint, desde date, hasta date)
language sql stable security definer set search_path = '' as $$
  select * from (
    select cuenta, 'Dropi · órdenes' as fuente, count(*), min(fecha), max(fecha) from public.dropi_ordenes group by 1
    union all select cuenta, 'Dropi · productos', count(*), null, null from public.dropi_orden_productos group by 1
    union all select cuenta, 'Dropi · cartera', count(*), min(fecha)::date, max(fecha)::date from public.dropi_cartera group by 1
    union all select cuenta, 'Meta · por campaña', count(*), min(fecha), max(fecha) from public.app_publicidad_campanas group by 1
    union all select cuenta, 'Meta · por día y cuenta', count(*), min(fecha), max(fecha) from public.app_publicidad_diaria group by 1
  ) x
  where public.app_es_owner()
  order by 1, 2;
$$;
revoke all on function public.app_estado_cargas() from public, anon;
grant execute on function public.app_estado_cargas() to authenticated;
