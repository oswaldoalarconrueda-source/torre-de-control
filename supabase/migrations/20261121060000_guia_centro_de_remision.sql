-- Pedido del dueño (21-nov-2026): en el Centro de Control cada guía muestra el centro de costos de su REMISIÓN.
-- La API de Effi no deja cambiar el centro de una guía ya creada (solo el de la remisión), así que cuando se cambia el
-- centro de una remisión (p. ej. los pedidos de Shopify de Colombia pasaron a «Shopify» / «Shopify sin confirmar"),
-- se anota aquí y v_guias lo usa en lugar del centro que trae la guía. La sincronización con Effi no toca esta tabla.
-- Además, los nombres de centro de costos se muestran siempre con inicial mayúscula y lo demás en minúscula.

create table if not exists public.effi_guia_centro (
  cuenta text not null,
  sucursal integer not null,          -- de la guía
  id bigint not null,                 -- de la guía
  centro_costos integer not null,     -- centro de la remisión en Effi
  nombre_centro_costos text not null,
  sucursal_ref integer,               -- remisión
  id_ref bigint,
  origen text,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, sucursal, id)
);
alter table public.effi_guia_centro enable row level security;
drop policy if exists ver on public.effi_guia_centro;
create policy ver on public.effi_guia_centro for select to authenticated
  using (cuenta = any ((select app_cuentas_visibles())::text[]));

-- «VENTAS RECUPERADAS» → «Ventas recuperadas».
create or replace function public.nombre_centro(t text) returns text language sql immutable as $$
  select case when t is null or btrim(t) = '' then t else upper(left(btrim(t), 1)) || lower(substr(btrim(t), 2)) end
$$;

-- Marca el centro de la remisión en todas sus guías vigentes de la torre (lo usan los cambios masivos y el futuro botón).
create or replace function public.guia_centro_marcar(p_cuenta text, p_sucursal_ref integer, p_id_ref bigint, p_centro integer, p_nombre text, p_origen text default null)
returns integer language sql security definer set search_path = public as $$
  with g as (
    insert into effi_guia_centro (cuenta, sucursal, id, centro_costos, nombre_centro_costos, sucursal_ref, id_ref, origen)
    select g.cuenta, g.sucursal, g.id, p_centro, p_nombre, p_sucursal_ref, p_id_ref, p_origen
    from effi_guias g where g.cuenta = p_cuenta and g.sucursal_ref = p_sucursal_ref and g.id_ref = p_id_ref and g.t_trans_ref = 4
    on conflict (cuenta, sucursal, id) do update set centro_costos = excluded.centro_costos, nombre_centro_costos = excluded.nombre_centro_costos,
      sucursal_ref = excluded.sucursal_ref, id_ref = excluded.id_ref, origen = excluded.origen, actualizado_en = now()
    returning 1)
  select count(*)::int from g
$$;
revoke all on function public.guia_centro_marcar(text, integer, bigint, integer, text, text) from public, anon, authenticated;

create or replace view public.v_guias with (security_invoker = true) as
 SELECT g.cuenta, g.empresa, g.sucursal, g.id, g.id_transaccion, g.guia, g.guia_adicional, g.fecha_trans, g.fecha_envio,
    g.fecha_entrega_esperada, g.fecha_guia_adicional, g.fecha_estado_final, g.fecha_estado_final_guia_adicional, g.fecha_anular,
    COALESCE(c.centro_costos, g.centro_costos) AS centro_costos,
    nombre_centro(COALESCE(c.nombre_centro_costos, g.nombre_centro_costos)) AS nombre_centro_costos,
    g.nombre_destinatario, g.id_destinatario, g.telefonos_destinatario, g.direccion_destinatario, g.nombre_ciudad_destinatario,
    g.nombre_provincia_destinatario, g.nombre_pais_destinatario, g.transportadora_efficommerce, g.nombre_transportadora_efficommerce,
    g.nombre_transportadora, g.servicio, g.contenido, g.t_trans_ref, g.sucursal_ref, g.id_ref, g.transaccion_dropshipping,
    g.empresa_proveedor, g.nombre_empresa_proveedor, g.empresa_distribuidor, g.nombre_empresa_distribuidor, g.divisa,
    g.valor_declarado, g.recaudo, g.valor_recaudo, g.valor_flete, g.descuento, g.est_guia, g.estado, g.est_guia_efficommerce,
    g.estado_efficommerce, g.est_guia_adicional_efficommerce, g.estado_adicional_efficommerce, g.liquidacion_efficommerce,
    g.recaudo_efficommerce, g.sin_recaudo_efficommerce, g.devolucion_efficommerce, g.indemnizacion_efficommerce,
    g.logistica_efficommerce, g.recaudo_efficommerce_transportadora, g.vigente, g.ultimo_cambio_estado, g.actualizado_en,
    g.fecha_recaudo, g.valor_recaudado, g.fecha_entrega,
    a.pais, a.nombre AS nombre_cuenta,
    ((g.fecha_trans + make_interval(mins => a.tz_offset_min)))::date AS fecha_local,
        CASE
            WHEN (g.fecha_recaudo IS NOT NULL) THEN 'ENTREGADO'::text
            WHEN (g.est_guia_efficommerce = 4) THEN 'ENTREGADO'::text
            WHEN (g.est_guia_efficommerce = 5) THEN 'DEVOLUCION'::text
            WHEN (g.est_guia_efficommerce = ANY (ARRAY[2, 8])) THEN 'EN_TRANSITO'::text
            WHEN (g.est_guia_efficommerce = 3) THEN 'NOVEDAD'::text
            WHEN (g.est_guia_efficommerce = 9) THEN 'EN_OFICINA'::text
            WHEN (g.est_guia_efficommerce = 6) THEN 'INDEMNIZACION'::text
            WHEN (g.est_guia_efficommerce = 7) THEN 'CANCELADA'::text
            ELSE 'PENDIENTE'::text
        END AS estado_u,
    COALESCE(g.fecha_entrega,
        CASE
            WHEN (g.est_guia_efficommerce = 4) THEN (g.fecha_estado_final - make_interval(mins => a.tz_offset_min))
            ELSE NULL::timestamp with time zone
        END) AS entregada_en,
    ((g.fecha_anular IS NOT NULL) OR (g.vigente IS FALSE)) AS anulada,
    COALESCE((g.nombre_destinatario ~~ '*%'::text), false) AS recuperado
   FROM effi_guias g
     JOIN effi_accounts a ON a.slug = g.cuenta
     LEFT JOIN effi_guia_centro c ON c.cuenta = g.cuenta AND c.sucursal = g.sucursal AND c.id = g.id;

-- El resumen por dimensiones comparaba el nombre en mayúsculas: ahora sin importar mayúsculas.
drop materialized view if exists public.effi_mv_dia_dim;
create materialized view public.effi_mv_dia_dim as
 SELECT cuenta, fecha_local, estado_u,
    COALESCE(nombre_transportadora_efficommerce, nombre_transportadora, 'Sin transportadora'::text) AS transportadora,
        CASE
            WHEN (recuperado OR lower(nombre_centro_costos) = ANY (ARRAY['pedidos recuperados', 'recuperado', 'ventas recuperadas'])) THEN 'Recuperado'::text
            ELSE COALESCE(nombre_centro_costos, 'Sin centro de costos'::text)
        END AS centro_costos,
    COALESCE(nombre_empresa_proveedor, 'Sin proveedor'::text) AS proveedor,
    count(*) AS guias
   FROM v_guias
  WHERE NOT anulada AND estado_u <> 'EXCLUIDA'::text
  GROUP BY 1, 2, 3, 4, 5, 6;
create unique index effi_mv_dia_dim_pk on public.effi_mv_dia_dim (cuenta, fecha_local, estado_u, transportadora, centro_costos, proveedor);
revoke all on public.effi_mv_dia_dim from anon, authenticated;

-- (aplicado como migración aparte «centro_shopify_gana_a_recuperado») Las ventas recuperadas (*) de Shopify se cuentan en «Shopify».
drop materialized view if exists public.effi_mv_dia_dim;
create materialized view public.effi_mv_dia_dim as
 SELECT cuenta, fecha_local, estado_u,
    COALESCE(nombre_transportadora_efficommerce, nombre_transportadora, 'Sin transportadora'::text) AS transportadora,
        CASE
            WHEN (recuperado AND coalesce(lower(nombre_centro_costos), '') NOT LIKE 'shopify%')
              OR lower(nombre_centro_costos) = ANY (ARRAY['pedidos recuperados', 'recuperado', 'ventas recuperadas']) THEN 'Recuperado'::text
            ELSE COALESCE(nombre_centro_costos, 'Sin centro de costos'::text)
        END AS centro_costos,
    COALESCE(nombre_empresa_proveedor, 'Sin proveedor'::text) AS proveedor,
    count(*) AS guias
   FROM v_guias
  WHERE NOT anulada AND estado_u <> 'EXCLUIDA'::text
  GROUP BY 1, 2, 3, 4, 5, 6;
create unique index effi_mv_dia_dim_pk on public.effi_mv_dia_dim (cuenta, fecha_local, estado_u, transportadora, centro_costos, proveedor);
revoke all on public.effi_mv_dia_dim from anon, authenticated;

do $do$
declare d text := pg_get_functiondef('public.oficina_lista'::regproc); v text := d;
begin
  d := replace(d, 'case when v.recuperado then ''Recuperado'' else v.nombre_centro_costos end',
    'case when v.recuperado and coalesce(lower(v.nombre_centro_costos), '''') not like ''shopify%'' then ''Recuperado'' else v.nombre_centro_costos end');
  if d = v then raise exception 'oficina_lista: no se encontró el centro'; end if;
  execute d;
end $do$;
