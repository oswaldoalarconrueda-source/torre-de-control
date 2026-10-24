-- Generado por supabase/schema/gen-sync-schema.mjs. No editar a mano.
-- Tablas de datos de Effi + funciones de upsert + estado del sync.

alter table public.effi_accounts add column if not exists empresa_id bigint;
alter table public.effi_accounts add column if not exists tz_offset_min int not null default -300; -- minutos respecto a UTC de la zona de la empresa (filtros de la API)
update public.effi_accounts set empresa_id = 58004, tz_offset_min = -300 where slug = 'TIENDA_CO';
update public.effi_accounts set empresa_id = 57380, tz_offset_min = -300 where slug = 'TIENDA_EC';
update public.effi_accounts set empresa_id = 56172, tz_offset_min = -360 where slug = 'TIENDA_GT';
update public.effi_accounts set tz_offset_min = -360 where slug = 'TIENDA_CR';

create table public.effi_guias (
  cuenta text not null references public.effi_accounts(slug),
  empresa bigint not null,
  sucursal int not null,
  id bigint not null,
  id_transaccion text,
  guia text,
  guia_adicional text,
  fecha_trans timestamptz,
  fecha_envio date,
  fecha_entrega_esperada date,
  fecha_guia_adicional timestamptz,
  fecha_estado_final timestamptz,
  fecha_estado_final_guia_adicional timestamptz,
  fecha_anular timestamptz,
  centro_costos int,
  nombre_centro_costos text,
  nombre_destinatario text,
  id_destinatario text,
  telefonos_destinatario text,
  direccion_destinatario text,
  nombre_ciudad_destinatario text,
  nombre_provincia_destinatario text,
  nombre_pais_destinatario text,
  transportadora_efficommerce int,
  nombre_transportadora_efficommerce text,
  nombre_transportadora text,
  servicio text,
  contenido text,
  t_trans_ref int,
  sucursal_ref int,
  id_ref bigint,
  transaccion_dropshipping bigint,
  empresa_proveedor bigint,
  nombre_empresa_proveedor text,
  empresa_distribuidor bigint,
  nombre_empresa_distribuidor text,
  divisa text,
  valor_declarado numeric,
  recaudo boolean,
  valor_recaudo numeric,
  valor_flete numeric,
  descuento numeric,
  est_guia int,
  estado text,
  est_guia_efficommerce int,
  estado_efficommerce text,
  est_guia_adicional_efficommerce int,
  estado_adicional_efficommerce text,
  liquidacion_efficommerce boolean,
  recaudo_efficommerce boolean,
  sin_recaudo_efficommerce boolean,
  devolucion_efficommerce boolean,
  indemnizacion_efficommerce boolean,
  logistica_efficommerce boolean,
  recaudo_efficommerce_transportadora boolean,
  vigente boolean,
  ultimo_cambio_estado timestamptz,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, empresa, sucursal, id)
);
alter table public.effi_guias enable row level security;
create index effi_guias_cuenta_guia on public.effi_guias (cuenta, guia);
create index effi_guias_cuenta_fecha_trans_desc on public.effi_guias (cuenta, fecha_trans desc);
create index effi_guias_cuenta_est_guia_efficommerce on public.effi_guias (cuenta, est_guia_efficommerce);

create function public.effi_upsert_guias(p_cuenta text, p_rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.effi_guias (cuenta, empresa, sucursal, id, id_transaccion, guia, guia_adicional, fecha_trans, fecha_envio, fecha_entrega_esperada, fecha_guia_adicional, fecha_estado_final, fecha_estado_final_guia_adicional, fecha_anular, centro_costos, nombre_centro_costos, nombre_destinatario, id_destinatario, telefonos_destinatario, direccion_destinatario, nombre_ciudad_destinatario, nombre_provincia_destinatario, nombre_pais_destinatario, transportadora_efficommerce, nombre_transportadora_efficommerce, nombre_transportadora, servicio, contenido, t_trans_ref, sucursal_ref, id_ref, transaccion_dropshipping, empresa_proveedor, nombre_empresa_proveedor, empresa_distribuidor, nombre_empresa_distribuidor, divisa, valor_declarado, recaudo, valor_recaudo, valor_flete, descuento, est_guia, estado, est_guia_efficommerce, estado_efficommerce, est_guia_adicional_efficommerce, estado_adicional_efficommerce, liquidacion_efficommerce, recaudo_efficommerce, sin_recaudo_efficommerce, devolucion_efficommerce, indemnizacion_efficommerce, logistica_efficommerce, recaudo_efficommerce_transportadora, vigente, ultimo_cambio_estado)
  select p_cuenta, r.empresa, r.sucursal, r.id, r.id_transaccion, r.guia, r.guia_adicional, r.fecha_trans, r.fecha_envio, r.fecha_entrega_esperada, r.fecha_guia_adicional, r.fecha_estado_final, r.fecha_estado_final_guia_adicional, r.fecha_anular, r.centro_costos, r.nombre_centro_costos, r.nombre_destinatario, r.id_destinatario, r.telefonos_destinatario, r.direccion_destinatario, r.nombre_ciudad_destinatario, r.nombre_provincia_destinatario, r.nombre_pais_destinatario, r.transportadora_efficommerce, r.nombre_transportadora_efficommerce, r.nombre_transportadora, r.servicio, r.contenido, r.t_trans_ref, r.sucursal_ref, r.id_ref, r.transaccion_dropshipping, r.empresa_proveedor, r.nombre_empresa_proveedor, r.empresa_distribuidor, r.nombre_empresa_distribuidor, r.divisa, r.valor_declarado, r.recaudo, r.valor_recaudo, r.valor_flete, r.descuento, r.est_guia, r.estado, r.est_guia_efficommerce, r.estado_efficommerce, r.est_guia_adicional_efficommerce, r.estado_adicional_efficommerce, r.liquidacion_efficommerce, r.recaudo_efficommerce, r.sin_recaudo_efficommerce, r.devolucion_efficommerce, r.indemnizacion_efficommerce, r.logistica_efficommerce, r.recaudo_efficommerce_transportadora, r.vigente, r.ultimo_cambio_estado
  from jsonb_populate_recordset(null::public.effi_guias, p_rows) r
  on conflict (cuenta, empresa, sucursal, id) do update set
    id_transaccion = coalesce(excluded.id_transaccion, effi_guias.id_transaccion),
    guia = coalesce(excluded.guia, effi_guias.guia),
    guia_adicional = coalesce(excluded.guia_adicional, effi_guias.guia_adicional),
    fecha_trans = coalesce(excluded.fecha_trans, effi_guias.fecha_trans),
    fecha_envio = coalesce(excluded.fecha_envio, effi_guias.fecha_envio),
    fecha_entrega_esperada = coalesce(excluded.fecha_entrega_esperada, effi_guias.fecha_entrega_esperada),
    fecha_guia_adicional = coalesce(excluded.fecha_guia_adicional, effi_guias.fecha_guia_adicional),
    fecha_estado_final = coalesce(excluded.fecha_estado_final, effi_guias.fecha_estado_final),
    fecha_estado_final_guia_adicional = coalesce(excluded.fecha_estado_final_guia_adicional, effi_guias.fecha_estado_final_guia_adicional),
    fecha_anular = coalesce(excluded.fecha_anular, effi_guias.fecha_anular),
    centro_costos = coalesce(excluded.centro_costos, effi_guias.centro_costos),
    nombre_centro_costos = coalesce(excluded.nombre_centro_costos, effi_guias.nombre_centro_costos),
    nombre_destinatario = coalesce(excluded.nombre_destinatario, effi_guias.nombre_destinatario),
    id_destinatario = coalesce(excluded.id_destinatario, effi_guias.id_destinatario),
    telefonos_destinatario = coalesce(excluded.telefonos_destinatario, effi_guias.telefonos_destinatario),
    direccion_destinatario = coalesce(excluded.direccion_destinatario, effi_guias.direccion_destinatario),
    nombre_ciudad_destinatario = coalesce(excluded.nombre_ciudad_destinatario, effi_guias.nombre_ciudad_destinatario),
    nombre_provincia_destinatario = coalesce(excluded.nombre_provincia_destinatario, effi_guias.nombre_provincia_destinatario),
    nombre_pais_destinatario = coalesce(excluded.nombre_pais_destinatario, effi_guias.nombre_pais_destinatario),
    transportadora_efficommerce = coalesce(excluded.transportadora_efficommerce, effi_guias.transportadora_efficommerce),
    nombre_transportadora_efficommerce = coalesce(excluded.nombre_transportadora_efficommerce, effi_guias.nombre_transportadora_efficommerce),
    nombre_transportadora = coalesce(excluded.nombre_transportadora, effi_guias.nombre_transportadora),
    servicio = coalesce(excluded.servicio, effi_guias.servicio),
    contenido = coalesce(excluded.contenido, effi_guias.contenido),
    t_trans_ref = coalesce(excluded.t_trans_ref, effi_guias.t_trans_ref),
    sucursal_ref = coalesce(excluded.sucursal_ref, effi_guias.sucursal_ref),
    id_ref = coalesce(excluded.id_ref, effi_guias.id_ref),
    transaccion_dropshipping = coalesce(excluded.transaccion_dropshipping, effi_guias.transaccion_dropshipping),
    empresa_proveedor = coalesce(excluded.empresa_proveedor, effi_guias.empresa_proveedor),
    nombre_empresa_proveedor = coalesce(excluded.nombre_empresa_proveedor, effi_guias.nombre_empresa_proveedor),
    empresa_distribuidor = coalesce(excluded.empresa_distribuidor, effi_guias.empresa_distribuidor),
    nombre_empresa_distribuidor = coalesce(excluded.nombre_empresa_distribuidor, effi_guias.nombre_empresa_distribuidor),
    divisa = coalesce(excluded.divisa, effi_guias.divisa),
    valor_declarado = coalesce(excluded.valor_declarado, effi_guias.valor_declarado),
    recaudo = coalesce(excluded.recaudo, effi_guias.recaudo),
    valor_recaudo = coalesce(excluded.valor_recaudo, effi_guias.valor_recaudo),
    valor_flete = coalesce(excluded.valor_flete, effi_guias.valor_flete),
    descuento = coalesce(excluded.descuento, effi_guias.descuento),
    est_guia = coalesce(excluded.est_guia, effi_guias.est_guia),
    estado = coalesce(excluded.estado, effi_guias.estado),
    est_guia_efficommerce = coalesce(excluded.est_guia_efficommerce, effi_guias.est_guia_efficommerce),
    estado_efficommerce = coalesce(excluded.estado_efficommerce, effi_guias.estado_efficommerce),
    est_guia_adicional_efficommerce = coalesce(excluded.est_guia_adicional_efficommerce, effi_guias.est_guia_adicional_efficommerce),
    estado_adicional_efficommerce = coalesce(excluded.estado_adicional_efficommerce, effi_guias.estado_adicional_efficommerce),
    liquidacion_efficommerce = coalesce(excluded.liquidacion_efficommerce, effi_guias.liquidacion_efficommerce),
    recaudo_efficommerce = coalesce(excluded.recaudo_efficommerce, effi_guias.recaudo_efficommerce),
    sin_recaudo_efficommerce = coalesce(excluded.sin_recaudo_efficommerce, effi_guias.sin_recaudo_efficommerce),
    devolucion_efficommerce = coalesce(excluded.devolucion_efficommerce, effi_guias.devolucion_efficommerce),
    indemnizacion_efficommerce = coalesce(excluded.indemnizacion_efficommerce, effi_guias.indemnizacion_efficommerce),
    logistica_efficommerce = coalesce(excluded.logistica_efficommerce, effi_guias.logistica_efficommerce),
    recaudo_efficommerce_transportadora = coalesce(excluded.recaudo_efficommerce_transportadora, effi_guias.recaudo_efficommerce_transportadora),
    vigente = coalesce(excluded.vigente, effi_guias.vigente),
    ultimo_cambio_estado = greatest(excluded.ultimo_cambio_estado, effi_guias.ultimo_cambio_estado),
    actualizado_en = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.effi_upsert_guias(text, jsonb) from public, anon, authenticated;
grant execute on function public.effi_upsert_guias(text, jsonb) to service_role;

create table public.effi_guia_estados (
  cuenta text not null references public.effi_accounts(slug),
  empresa bigint not null,
  sucursal int not null,
  id_guia bigint not null,
  fecha_hist_est timestamptz not null,
  guia_inicial_adicional boolean not null,
  est_guia_new int not null,
  guia text,
  guia_adicional text,
  estado_new text,
  est_guia_new_efficommerce int,
  estado_new_efficommerce text,
  observacion_hist_est text,
  responsable_cambio text,
  transportadora_efficommerce int,
  nombre_transportadora_efficommerce text,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, empresa, sucursal, id_guia, fecha_hist_est, guia_inicial_adicional, est_guia_new)
);
alter table public.effi_guia_estados enable row level security;
create index effi_guia_estados_cuenta_fecha_hist_est_desc on public.effi_guia_estados (cuenta, fecha_hist_est desc);
create index effi_guia_estados_cuenta_guia on public.effi_guia_estados (cuenta, guia);

create function public.effi_upsert_guia_estados(p_cuenta text, p_rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.effi_guia_estados (cuenta, empresa, sucursal, id_guia, fecha_hist_est, guia_inicial_adicional, est_guia_new, guia, guia_adicional, estado_new, est_guia_new_efficommerce, estado_new_efficommerce, observacion_hist_est, responsable_cambio, transportadora_efficommerce, nombre_transportadora_efficommerce)
  select p_cuenta, r.empresa, r.sucursal, r.id_guia, r.fecha_hist_est, r.guia_inicial_adicional, r.est_guia_new, r.guia, r.guia_adicional, r.estado_new, r.est_guia_new_efficommerce, r.estado_new_efficommerce, r.observacion_hist_est, r.responsable_cambio, r.transportadora_efficommerce, r.nombre_transportadora_efficommerce
  from jsonb_populate_recordset(null::public.effi_guia_estados, p_rows) r
  on conflict (cuenta, empresa, sucursal, id_guia, fecha_hist_est, guia_inicial_adicional, est_guia_new) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.effi_upsert_guia_estados(text, jsonb) from public, anon, authenticated;
grant execute on function public.effi_upsert_guia_estados(text, jsonb) to service_role;

create table public.effi_novedades (
  cuenta text not null references public.effi_accounts(slug),
  empresa bigint not null,
  id bigint not null,
  guia_novedad text,
  guia_inicial_adicional boolean,
  est_novedad int,
  estado_novedad text,
  t_novedad int,
  tipo_novedad text,
  transportadora_efficommerce int,
  nombre_transportadora_efficommerce text,
  id_novedad int,
  nombre_novedad text,
  aclaracion text,
  cant_gestion int,
  fecha_trans timestamptz,
  fecha_trans_transportadora timestamp,
  fecha_ultima_gestion timestamp,
  fecha_solucion timestamp,
  sucursal_guia int,
  id_guia bigint,
  guia text,
  guia_adicional text,
  nombre_centro_costos text,
  nombre_ciudad_destinatario text,
  nombre_provincia_destinatario text,
  valor_recaudo numeric,
  est_guia int,
  estado text,
  vigente boolean,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, empresa, id)
);
alter table public.effi_novedades enable row level security;
create index effi_novedades_cuenta_fecha_trans_desc on public.effi_novedades (cuenta, fecha_trans desc);
create index effi_novedades_cuenta_guia on public.effi_novedades (cuenta, guia);
create index effi_novedades_cuenta_est_novedad on public.effi_novedades (cuenta, est_novedad);

create function public.effi_upsert_novedades(p_cuenta text, p_rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.effi_novedades (cuenta, empresa, id, guia_novedad, guia_inicial_adicional, est_novedad, estado_novedad, t_novedad, tipo_novedad, transportadora_efficommerce, nombre_transportadora_efficommerce, id_novedad, nombre_novedad, aclaracion, cant_gestion, fecha_trans, fecha_trans_transportadora, fecha_ultima_gestion, fecha_solucion, sucursal_guia, id_guia, guia, guia_adicional, nombre_centro_costos, nombre_ciudad_destinatario, nombre_provincia_destinatario, valor_recaudo, est_guia, estado, vigente)
  select p_cuenta, r.empresa, r.id, r.guia_novedad, r.guia_inicial_adicional, r.est_novedad, r.estado_novedad, r.t_novedad, r.tipo_novedad, r.transportadora_efficommerce, r.nombre_transportadora_efficommerce, r.id_novedad, r.nombre_novedad, r.aclaracion, r.cant_gestion, r.fecha_trans, r.fecha_trans_transportadora, r.fecha_ultima_gestion, r.fecha_solucion, r.sucursal_guia, r.id_guia, r.guia, r.guia_adicional, r.nombre_centro_costos, r.nombre_ciudad_destinatario, r.nombre_provincia_destinatario, r.valor_recaudo, r.est_guia, r.estado, r.vigente
  from jsonb_populate_recordset(null::public.effi_novedades, p_rows) r
  on conflict (cuenta, empresa, id) do update set
    guia_novedad = coalesce(excluded.guia_novedad, effi_novedades.guia_novedad),
    guia_inicial_adicional = coalesce(excluded.guia_inicial_adicional, effi_novedades.guia_inicial_adicional),
    est_novedad = coalesce(excluded.est_novedad, effi_novedades.est_novedad),
    estado_novedad = coalesce(excluded.estado_novedad, effi_novedades.estado_novedad),
    t_novedad = coalesce(excluded.t_novedad, effi_novedades.t_novedad),
    tipo_novedad = coalesce(excluded.tipo_novedad, effi_novedades.tipo_novedad),
    transportadora_efficommerce = coalesce(excluded.transportadora_efficommerce, effi_novedades.transportadora_efficommerce),
    nombre_transportadora_efficommerce = coalesce(excluded.nombre_transportadora_efficommerce, effi_novedades.nombre_transportadora_efficommerce),
    id_novedad = coalesce(excluded.id_novedad, effi_novedades.id_novedad),
    nombre_novedad = coalesce(excluded.nombre_novedad, effi_novedades.nombre_novedad),
    aclaracion = coalesce(excluded.aclaracion, effi_novedades.aclaracion),
    cant_gestion = coalesce(excluded.cant_gestion, effi_novedades.cant_gestion),
    fecha_trans = coalesce(excluded.fecha_trans, effi_novedades.fecha_trans),
    fecha_trans_transportadora = coalesce(excluded.fecha_trans_transportadora, effi_novedades.fecha_trans_transportadora),
    fecha_ultima_gestion = coalesce(excluded.fecha_ultima_gestion, effi_novedades.fecha_ultima_gestion),
    fecha_solucion = coalesce(excluded.fecha_solucion, effi_novedades.fecha_solucion),
    sucursal_guia = coalesce(excluded.sucursal_guia, effi_novedades.sucursal_guia),
    id_guia = coalesce(excluded.id_guia, effi_novedades.id_guia),
    guia = coalesce(excluded.guia, effi_novedades.guia),
    guia_adicional = coalesce(excluded.guia_adicional, effi_novedades.guia_adicional),
    nombre_centro_costos = coalesce(excluded.nombre_centro_costos, effi_novedades.nombre_centro_costos),
    nombre_ciudad_destinatario = coalesce(excluded.nombre_ciudad_destinatario, effi_novedades.nombre_ciudad_destinatario),
    nombre_provincia_destinatario = coalesce(excluded.nombre_provincia_destinatario, effi_novedades.nombre_provincia_destinatario),
    valor_recaudo = coalesce(excluded.valor_recaudo, effi_novedades.valor_recaudo),
    est_guia = coalesce(excluded.est_guia, effi_novedades.est_guia),
    estado = coalesce(excluded.estado, effi_novedades.estado),
    vigente = coalesce(excluded.vigente, effi_novedades.vigente),
    actualizado_en = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.effi_upsert_novedades(text, jsonb) from public, anon, authenticated;
grant execute on function public.effi_upsert_novedades(text, jsonb) to service_role;

create table public.effi_wallet (
  cuenta text not null references public.effi_accounts(slug),
  id bigint not null,
  fecha_trans timestamptz,
  fecha_origen timestamptz,
  cuenta_effi bigint,
  sucursal int,
  centro_costos int,
  nombre_centro_costos text,
  t_movimiento int,
  tipo_movimiento text,
  detalle text,
  valor numeric,
  divisa text,
  empresa_responsable bigint,
  movimiento_dinero_effi_reversion bigint,
  guia_inicial text,
  guia_adicional text,
  empresa_guia bigint,
  sucursal_guia int,
  id_guia bigint,
  t_trans_ref int,
  sucursal_ref int,
  id_ref bigint,
  transportadora_efficommerce int,
  nombre_transportadora_efficommerce text,
  solicitud_retiro bigint,
  transferencia_cuenta_effi bigint,
  t_origen int,
  tipo_origen text,
  fecha_anular timestamptz,
  vigente boolean,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, id)
);
alter table public.effi_wallet enable row level security;
create index effi_wallet_cuenta_fecha_trans_desc on public.effi_wallet (cuenta, fecha_trans desc);
create index effi_wallet_cuenta_guia_inicial on public.effi_wallet (cuenta, guia_inicial);
create index effi_wallet_cuenta_t_movimiento on public.effi_wallet (cuenta, t_movimiento);

create function public.effi_upsert_wallet(p_cuenta text, p_rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.effi_wallet (cuenta, id, fecha_trans, fecha_origen, cuenta_effi, sucursal, centro_costos, nombre_centro_costos, t_movimiento, tipo_movimiento, detalle, valor, divisa, empresa_responsable, movimiento_dinero_effi_reversion, guia_inicial, guia_adicional, empresa_guia, sucursal_guia, id_guia, t_trans_ref, sucursal_ref, id_ref, transportadora_efficommerce, nombre_transportadora_efficommerce, solicitud_retiro, transferencia_cuenta_effi, t_origen, tipo_origen, fecha_anular, vigente)
  select p_cuenta, r.id, r.fecha_trans, r.fecha_origen, r.cuenta_effi, r.sucursal, r.centro_costos, r.nombre_centro_costos, r.t_movimiento, r.tipo_movimiento, r.detalle, r.valor, r.divisa, r.empresa_responsable, r.movimiento_dinero_effi_reversion, r.guia_inicial, r.guia_adicional, r.empresa_guia, r.sucursal_guia, r.id_guia, r.t_trans_ref, r.sucursal_ref, r.id_ref, r.transportadora_efficommerce, r.nombre_transportadora_efficommerce, r.solicitud_retiro, r.transferencia_cuenta_effi, r.t_origen, r.tipo_origen, r.fecha_anular, r.vigente
  from jsonb_populate_recordset(null::public.effi_wallet, p_rows) r
  on conflict (cuenta, id) do update set
    fecha_trans = coalesce(excluded.fecha_trans, effi_wallet.fecha_trans),
    fecha_origen = coalesce(excluded.fecha_origen, effi_wallet.fecha_origen),
    cuenta_effi = coalesce(excluded.cuenta_effi, effi_wallet.cuenta_effi),
    sucursal = coalesce(excluded.sucursal, effi_wallet.sucursal),
    centro_costos = coalesce(excluded.centro_costos, effi_wallet.centro_costos),
    nombre_centro_costos = coalesce(excluded.nombre_centro_costos, effi_wallet.nombre_centro_costos),
    t_movimiento = coalesce(excluded.t_movimiento, effi_wallet.t_movimiento),
    tipo_movimiento = coalesce(excluded.tipo_movimiento, effi_wallet.tipo_movimiento),
    detalle = coalesce(excluded.detalle, effi_wallet.detalle),
    valor = coalesce(excluded.valor, effi_wallet.valor),
    divisa = coalesce(excluded.divisa, effi_wallet.divisa),
    empresa_responsable = coalesce(excluded.empresa_responsable, effi_wallet.empresa_responsable),
    movimiento_dinero_effi_reversion = coalesce(excluded.movimiento_dinero_effi_reversion, effi_wallet.movimiento_dinero_effi_reversion),
    guia_inicial = coalesce(excluded.guia_inicial, effi_wallet.guia_inicial),
    guia_adicional = coalesce(excluded.guia_adicional, effi_wallet.guia_adicional),
    empresa_guia = coalesce(excluded.empresa_guia, effi_wallet.empresa_guia),
    sucursal_guia = coalesce(excluded.sucursal_guia, effi_wallet.sucursal_guia),
    id_guia = coalesce(excluded.id_guia, effi_wallet.id_guia),
    t_trans_ref = coalesce(excluded.t_trans_ref, effi_wallet.t_trans_ref),
    sucursal_ref = coalesce(excluded.sucursal_ref, effi_wallet.sucursal_ref),
    id_ref = coalesce(excluded.id_ref, effi_wallet.id_ref),
    transportadora_efficommerce = coalesce(excluded.transportadora_efficommerce, effi_wallet.transportadora_efficommerce),
    nombre_transportadora_efficommerce = coalesce(excluded.nombre_transportadora_efficommerce, effi_wallet.nombre_transportadora_efficommerce),
    solicitud_retiro = coalesce(excluded.solicitud_retiro, effi_wallet.solicitud_retiro),
    transferencia_cuenta_effi = coalesce(excluded.transferencia_cuenta_effi, effi_wallet.transferencia_cuenta_effi),
    t_origen = coalesce(excluded.t_origen, effi_wallet.t_origen),
    tipo_origen = coalesce(excluded.tipo_origen, effi_wallet.tipo_origen),
    fecha_anular = coalesce(excluded.fecha_anular, effi_wallet.fecha_anular),
    vigente = coalesce(excluded.vigente, effi_wallet.vigente),
    actualizado_en = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.effi_upsert_wallet(text, jsonb) from public, anon, authenticated;
grant execute on function public.effi_upsert_wallet(text, jsonb) to service_role;

-- Estado del sync incremental: hasta qué instante (UTC) está sincronizado cada recurso de cada cuenta.
create table public.effi_sync_state (
  cuenta text not null references public.effi_accounts(slug),
  recurso text not null,
  cursor_utc timestamptz,
  ultimo_ok timestamptz,
  ultimo_error text,
  filas_ultima int,
  primary key (cuenta, recurso)
);
alter table public.effi_sync_state enable row level security;

-- Cargas históricas y reconciliaciones: rangos que se recorren por tramos en las corridas del cron.
create table public.effi_sync_jobs (
  id bigint generated always as identity primary key,
  cuenta text not null references public.effi_accounts(slug),
  recurso text not null,
  desde_utc timestamptz not null,
  hasta_utc timestamptz not null,
  avance_utc timestamptz not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','listo','error')),
  filas bigint not null default 0,
  error text,
  creado_en timestamptz not null default now(),
  terminado_en timestamptz
);
alter table public.effi_sync_jobs enable row level security;
create index effi_sync_jobs_pendientes on public.effi_sync_jobs (cuenta, id) where estado = 'pendiente';

-- Bitácora de corridas (se conserva 7 días).
create table public.effi_sync_runs (
  id bigint generated always as identity primary key,
  inicio timestamptz not null default now(),
  fin timestamptz,
  resumen jsonb
);
alter table public.effi_sync_runs enable row level security;

-- Candado para que dos corridas no se pisen.
create table public.effi_sync_lock (
  id int primary key default 1 check (id = 1),
  bloqueado_hasta timestamptz not null default '-infinity'
);
insert into public.effi_sync_lock default values;
alter table public.effi_sync_lock enable row level security;

create function public.effi_sync_try_lock(p_segundos int) returns boolean
language sql security definer set search_path = '' as $$
  update public.effi_sync_lock set bloqueado_hasta = now() + make_interval(secs => p_segundos)
  where id = 1 and bloqueado_hasta < now()
  returning true;
$$;
create function public.effi_sync_unlock() returns void
language sql security definer set search_path = '' as $$
  update public.effi_sync_lock set bloqueado_hasta = '-infinity' where id = 1;
$$;

-- Secretos en Vault: API keys de Effi (effi_api_key_<SLUG>) y token del cron (effi_sync_token).
create function public.effi_set_api_key(p_slug text, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.effi_accounts where slug = p_slug) then
    raise exception 'Cuenta desconocida: %', p_slug;
  end if;
  select id into v_id from vault.secrets where name = 'effi_api_key_' || p_slug;
  if v_id is null then
    perform vault.create_secret(p_key, 'effi_api_key_' || p_slug, 'API key Effi de ' || p_slug);
  else
    perform vault.update_secret(v_id, p_key);
  end if;
end $$;

create function public.effi_get_api_keys() returns table (slug text, api_key text)
language sql security definer set search_path = '' as $$
  select a.slug, s.decrypted_secret
  from public.effi_accounts a
  join vault.decrypted_secrets s on s.name = 'effi_api_key_' || a.slug
  where a.activa;
$$;

create function public.effi_check_sync_token(p_token text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'effi_sync_token' and decrypted_secret = p_token);
$$;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'effi_sync_token', 'Token que el cron envía a la función effi-sync');

do $$
declare f text;
begin
  foreach f in array array['effi_sync_try_lock(int)','effi_sync_unlock()','effi_set_api_key(text, text)','effi_get_api_keys()','effi_check_sync_token(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
