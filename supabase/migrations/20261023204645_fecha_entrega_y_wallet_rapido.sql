-- 1) Funciones de clasificación del wallet sin SET (así Postgres las "inlinea" y no cuestan por fila).
create or replace function public.effi_linea_wallet(p_t int) returns text
language sql immutable as $$
  select case p_t
    when 1 then 'Recaudo de venta'
    when 20 then 'Indemnizaciones' when 21 then 'Indemnizaciones'
    when 34 then 'Crédito revertido'
    when 13 then 'Costo de mercancía'
    when 7 then 'Flete con recaudo' when 8 then 'Flete sin recaudo' when 9 then 'Flete devolución'
    when 12 then 'Fulfillment'
    when 15 then 'Otros (4xmil)'
    when 35 then 'Débito revertido'
    when 18 then 'Retiros' when 31 then 'Retiros' when 36 then 'Retiros'
    else 'Otros' end;
$$;
create or replace function public.effi_grupo_wallet(p_t int) returns text
language sql immutable as $$
  select case when p_t in (18, 31, 36) then 'caja'
              when p_t in (1, 20, 21, 34) then 'ingreso'
              else 'egreso' end;
$$;

-- 2) Momento exacto de entrega (UTC), tomado del historial de estados.
--    fecha_estado_final de Effi es solo fecha local (medianoche), sirve de respaldo.
alter table public.effi_guias add column if not exists fecha_entrega timestamptz;

update public.effi_guias g set fecha_entrega = e.f
from (
  select cuenta, empresa, sucursal, id_guia, min(fecha_hist_est) f
  from public.effi_guia_estados
  where est_guia_new_efficommerce = 4 and guia_inicial_adicional
  group by 1, 2, 3, 4
) e
where g.cuenta = e.cuenta and g.empresa = e.empresa and g.sucursal = e.sucursal and g.id = e.id_guia;

create or replace function public.effi_ingest(p_cuenta text, p_recurso text, p_payload jsonb) returns int
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_emp bigint;
  v_rows jsonb;
  n int := 0;
begin
  select empresa_id into v_emp from public.effi_accounts where slug = p_cuenta;
  select coalesce(jsonb_agg(public.effi_clean(x)), '[]'::jsonb) into v_rows
  from jsonb_array_elements(coalesce(p_payload -> 'data', '[]'::jsonb)) x;
  if jsonb_array_length(v_rows) = 0 then return 0; end if;

  if v_emp is null and p_recurso = 'guias' then
    v_emp := (v_rows -> 0 ->> 'empresa')::bigint;
    update public.effi_accounts set empresa_id = v_emp where slug = p_cuenta and empresa_id is null;
  end if;

  select jsonb_agg(r || jsonb_build_object('empresa', coalesce(r ->> 'empresa', r ->> 'empresa_distribuidor', v_emp::text)))
  into v_rows from jsonb_array_elements(v_rows) r;

  if p_recurso = 'guias' then
    n := public.effi_upsert_guias(p_cuenta, v_rows);
    perform public.effi_refrescar_recaudo(p_cuenta, array(select r ->> 'guia' from jsonb_array_elements(v_rows) r where r ->> 'guia' is not null));
  elsif p_recurso = 'wallet' then
    n := public.effi_upsert_wallet(p_cuenta, v_rows);
    perform public.effi_refrescar_recaudo(p_cuenta, array(select r ->> 'guia_inicial' from jsonb_array_elements(v_rows) r where (r ->> 't_movimiento') = '1'));
  elsif p_recurso like 'novedades%' then
    n := public.effi_upsert_novedades(p_cuenta, v_rows);
  elsif p_recurso = 'hist' then
    n := public.effi_upsert_guia_estados(p_cuenta, (
      select jsonb_agg(jsonb_build_object(
        'empresa', r -> 'empresa',
        'sucursal', r -> 'sucursal',
        'id_guia', r -> 'id',
        'fecha_hist_est', r -> 'fecha_hist_est',
        'guia_inicial_adicional', coalesce(nullif(r -> 'guia_inicial_adicional', 'null'::jsonb), '"1"'::jsonb),
        'est_guia_new', coalesce(nullif(r -> 'est_guia_new', 'null'::jsonb), '-1'::jsonb),
        'guia', r -> 'guia',
        'guia_adicional', r -> 'guia_adicional',
        'estado_new', r -> 'estado_new',
        'est_guia_new_efficommerce', r -> 'est_guia_new_efficommerce',
        'estado_new_efficommerce', r -> 'estado_new_efficommerce',
        'observacion_hist_est', r -> 'observacion_hist_est',
        'responsable_cambio', r -> 'responsable_cambio',
        'transportadora_efficommerce', r -> 'transportadora_efficommerce',
        'nombre_transportadora_efficommerce', r -> 'nombre_transportadora_efficommerce'))
      from jsonb_array_elements(v_rows) r));
    perform public.effi_upsert_guias(p_cuenta, (
      select jsonb_agg(g) from (
        select distinct on (r ->> 'empresa', r ->> 'sucursal', r ->> 'id')
          r || jsonb_build_object('ultimo_cambio_estado', r -> 'fecha_hist_est') g
        from jsonb_array_elements(v_rows) r
        order by r ->> 'empresa', r ->> 'sucursal', r ->> 'id', r ->> 'fecha_hist_est' desc
      ) s));
    -- Momento de entrega: el primer cambio de la guía inicial a "Entregada" (estado global 4).
    update public.effi_guias g set fecha_entrega = least(coalesce(g.fecha_entrega, e.f), e.f)
    from (
      select (r ->> 'empresa')::bigint emp, (r ->> 'sucursal')::int suc, (r ->> 'id')::bigint id, min((r ->> 'fecha_hist_est')::timestamptz) f
      from jsonb_array_elements(v_rows) r
      where r ->> 'est_guia_new_efficommerce' = '4' and coalesce(r ->> 'guia_inicial_adicional', '1') = '1'
      group by 1, 2, 3
    ) e
    where g.cuenta = p_cuenta and g.empresa = e.emp and g.sucursal = e.suc and g.id = e.id;
  else
    raise exception 'Recurso desconocido: %', p_recurso;
  end if;
  return n;
end $$;

-- 3) Vista: "entregada_en" = momento exacto (historial) o, si no hay, fin del día local de fecha_estado_final.
drop view public.v_guias;
create view public.v_guias with (security_invoker = true) as
select
  g.*,
  a.pais, a.nombre as nombre_cuenta,
  (g.fecha_trans + make_interval(mins => a.tz_offset_min))::date as fecha_local,
  case
    when g.fecha_recaudo is not null then 'ENTREGADO'  -- el wallet manda
    when g.est_guia_efficommerce = 4 then 'ENTREGADO'
    when g.est_guia_efficommerce = 5 then 'DEVOLUCION'
    when g.est_guia_efficommerce in (2, 8) then 'EN_TRANSITO'
    when g.est_guia_efficommerce = 3 then 'NOVEDAD'
    when g.est_guia_efficommerce = 9 then 'EN_OFICINA'
    when g.est_guia_efficommerce = 6 then 'INDEMNIZACION'
    when g.est_guia_efficommerce = 7 then 'EXCLUIDA'
    else 'PENDIENTE'
  end as estado_u,
  coalesce(g.fecha_entrega,
    case when g.est_guia_efficommerce = 4 then g.fecha_estado_final - make_interval(mins => a.tz_offset_min) end) as entregada_en,
  (g.fecha_anular is not null or g.vigente is false) as anulada,
  coalesce(g.nombre_destinatario like '*%', false) as recuperado
from public.effi_guias g
join public.effi_accounts a on a.slug = g.cuenta;
revoke all on public.v_guias from anon;
grant select on public.v_guias to authenticated;

-- 4) KPIs con la fecha de entrega exacta.
create or replace function public.kpi_resumen(p_cuentas text[], p_desde date, p_hasta date)
returns table (
  cuenta text, nombre text, pais text, divisa text,
  guias bigint, entregadas bigint, devoluciones bigint, en_transito bigint, novedad bigint,
  en_oficina bigint, pendientes bigint, indemnizadas bigint, recuperados bigint,
  efectividad numeric, pct_devolucion numeric,
  recaudo_potencial numeric, recaudo_entregado numeric, ticket_promedio numeric,
  flete_total numeric, flete_promedio numeric,
  sin_liquidar bigint, dias_entrega numeric, dias_pago numeric
)
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select g.cuenta, max(g.nombre_cuenta), max(g.pais), max(g.divisa),
    count(*),
    count(*) filter (where estado_u = 'ENTREGADO'),
    count(*) filter (where estado_u = 'DEVOLUCION'),
    count(*) filter (where estado_u = 'EN_TRANSITO'),
    count(*) filter (where estado_u = 'NOVEDAD'),
    count(*) filter (where estado_u = 'EN_OFICINA'),
    count(*) filter (where estado_u = 'PENDIENTE'),
    count(*) filter (where estado_u = 'INDEMNIZACION'),
    count(*) filter (where recuperado),
    round(count(*) filter (where estado_u = 'ENTREGADO')::numeric
      / nullif(count(*) filter (where estado_u in ('ENTREGADO', 'DEVOLUCION')), 0), 4),
    round(count(*) filter (where estado_u = 'DEVOLUCION')::numeric
      / nullif(count(*) filter (where estado_u <> 'INDEMNIZACION'), 0), 4),
    sum(valor_recaudo) filter (where recaudo),
    sum(valor_recaudo) filter (where recaudo and estado_u = 'ENTREGADO'),
    round(avg(valor_recaudo) filter (where recaudo and valor_recaudo > 0), 2),
    sum(valor_flete),
    round(avg(valor_flete) filter (where valor_flete > 0), 2),
    count(*) filter (where est_guia_efficommerce = 4 and fecha_recaudo is null and recaudo),
    round(avg(extract(epoch from entregada_en - fecha_trans) / 86400)
      filter (where estado_u = 'ENTREGADO' and entregada_en > fecha_trans)::numeric, 1),
    round(avg(extract(epoch from fecha_recaudo - entregada_en) / 86400)
      filter (where fecha_recaudo is not null and entregada_en is not null and fecha_recaudo >= entregada_en)::numeric, 1)
  from public.v_guias g
  where not anulada and estado_u <> 'EXCLUIDA'
    and (p_cuentas is null or g.cuenta = any (p_cuentas))
    and fecha_local between p_desde and p_hasta
  group by g.cuenta
  order by g.cuenta;
$$;

create or replace function public.kpi_transportadoras(p_cuentas text[], p_desde date, p_hasta date)
returns table (
  cuenta text, transportadora text, guias bigint, entregadas bigint, devoluciones bigint, abiertas bigint,
  efectividad numeric, pct_devolucion numeric, flete_promedio numeric, ticket_promedio numeric,
  recaudo_entregado numeric, dias_entrega numeric, dias_pago numeric, sin_liquidar bigint
)
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select cuenta, coalesce(nombre_transportadora_efficommerce, nombre_transportadora, 'Sin transportadora'),
    count(*),
    count(*) filter (where estado_u = 'ENTREGADO'),
    count(*) filter (where estado_u = 'DEVOLUCION'),
    count(*) filter (where estado_u in ('EN_TRANSITO', 'NOVEDAD', 'EN_OFICINA', 'PENDIENTE')),
    round(count(*) filter (where estado_u = 'ENTREGADO')::numeric
      / nullif(count(*) filter (where estado_u in ('ENTREGADO', 'DEVOLUCION')), 0), 4),
    round(count(*) filter (where estado_u = 'DEVOLUCION')::numeric
      / nullif(count(*) filter (where estado_u <> 'INDEMNIZACION'), 0), 4),
    round(avg(valor_flete) filter (where valor_flete > 0), 2),
    round(avg(valor_recaudo) filter (where recaudo and valor_recaudo > 0), 2),
    sum(valor_recaudo) filter (where recaudo and estado_u = 'ENTREGADO'),
    round(avg(extract(epoch from entregada_en - fecha_trans) / 86400)
      filter (where estado_u = 'ENTREGADO' and entregada_en > fecha_trans)::numeric, 1),
    round(avg(extract(epoch from fecha_recaudo - entregada_en) / 86400)
      filter (where fecha_recaudo is not null and entregada_en is not null and fecha_recaudo >= entregada_en)::numeric, 1),
    count(*) filter (where est_guia_efficommerce = 4 and fecha_recaudo is null and recaudo)
  from public.v_guias
  where not anulada and estado_u <> 'EXCLUIDA'
    and (p_cuentas is null or cuenta = any (p_cuentas))
    and fecha_local between p_desde and p_hasta
  group by 1, 2 order by 3 desc;
$$;

create or replace function public.kpi_sin_liquidar(p_cuentas text[], p_desde date, p_hasta date)
returns table (cuenta text, guia text, transportadora text, destino text, fecha_entrega timestamptz, dias numeric, valor_recaudo numeric, divisa text)
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select cuenta, guia, nombre_transportadora_efficommerce,
    concat_ws(', ', nombre_ciudad_destinatario, nombre_provincia_destinatario),
    entregada_en,
    round((extract(epoch from now() - entregada_en) / 86400)::numeric, 1),
    valor_recaudo, divisa
  from public.v_guias
  where not anulada and est_guia_efficommerce = 4 and fecha_recaudo is null and recaudo
    and (p_cuentas is null or cuenta = any (p_cuentas))
    and fecha_local between p_desde and p_hasta
  order by entregada_en nulls last;
$$;

-- 5) Wallet: filtro por rango de fecha con índice (además de la fecha local exacta).
create or replace function public.kpi_wallet(p_cuentas text[], p_desde date, p_hasta date)
returns table (cuenta text, divisa text, grupo text, linea text, movimientos bigint, total numeric)
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select m.cuenta, max(m.divisa), public.effi_grupo_wallet(m.t_movimiento), public.effi_linea_wallet(m.t_movimiento),
    count(*), sum(m.valor)
  from public.effi_wallet m
  join public.effi_accounts a on a.slug = m.cuenta
  where m.vigente is not false
    and (p_cuentas is null or m.cuenta = any (p_cuentas))
    and m.fecha_trans >= p_desde::timestamptz - interval '1 day' and m.fecha_trans < p_hasta::timestamptz + interval '2 days'
    and (m.fecha_trans + make_interval(mins => a.tz_offset_min))::date between p_desde and p_hasta
  group by 1, 3, 4 order by 1, 3, 6;
$$;

create or replace function public.kpi_wallet_diario(p_cuentas text[], p_desde date, p_hasta date)
returns table (fecha date, cuenta text, grupo text, total numeric)
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select (m.fecha_trans + make_interval(mins => a.tz_offset_min))::date, m.cuenta, public.effi_grupo_wallet(m.t_movimiento), sum(m.valor)
  from public.effi_wallet m
  join public.effi_accounts a on a.slug = m.cuenta
  where m.vigente is not false
    and (p_cuentas is null or m.cuenta = any (p_cuentas))
    and m.fecha_trans >= p_desde::timestamptz - interval '1 day' and m.fecha_trans < p_hasta::timestamptz + interval '2 days'
    and (m.fecha_trans + make_interval(mins => a.tz_offset_min))::date between p_desde and p_hasta
  group by 1, 2, 3 order by 1;
$$;

create index if not exists effi_wallet_fecha_trans on public.effi_wallet (fecha_trans);
