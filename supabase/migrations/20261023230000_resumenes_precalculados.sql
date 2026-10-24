-- Velocidad: resúmenes precalculados (vistas materializadas) que se refrescan cada minuto.
-- Las KPIs leen unos miles de filas agregadas en vez de recorrer todas las guías en cada clic.
-- Las vistas materializadas no tienen RLS: solo se leen a través de las funciones kpi_* (security
-- definer), que filtran por las cuentas visibles del usuario (app_cuentas_visibles).

create materialized view public.effi_mv_dia as
select
  cuenta,
  fecha_local,
  coalesce(nombre_transportadora_efficommerce, nombre_transportadora, 'Sin transportadora') as transportadora,
  estado_u,
  count(*) as guias,
  count(*) filter (where recuperado) as recuperados,
  coalesce(sum(valor_recaudo) filter (where recaudo), 0) as recaudo_sum,
  coalesce(sum(valor_recaudo) filter (where recaudo and valor_recaudo > 0), 0) as recaudo_pos_sum,
  count(*) filter (where recaudo and valor_recaudo > 0) as recaudo_pos_n,
  coalesce(sum(valor_flete), 0) as flete_sum,
  coalesce(sum(valor_flete) filter (where valor_flete > 0), 0) as flete_pos_sum,
  count(*) filter (where valor_flete > 0) as flete_pos_n,
  count(*) filter (where est_guia_efficommerce = 4 and fecha_recaudo is null and recaudo) as sin_liquidar,
  coalesce(sum(extract(epoch from entregada_en - fecha_trans) / 86400)
    filter (where estado_u = 'ENTREGADO' and entregada_en > fecha_trans), 0) as dias_ent_sum,
  count(*) filter (where estado_u = 'ENTREGADO' and entregada_en > fecha_trans) as dias_ent_n,
  coalesce(sum(extract(epoch from fecha_recaudo - entregada_en) / 86400)
    filter (where fecha_recaudo is not null and entregada_en is not null and fecha_recaudo >= entregada_en), 0) as dias_pago_sum,
  count(*) filter (where fecha_recaudo is not null and entregada_en is not null and fecha_recaudo >= entregada_en) as dias_pago_n
from public.v_guias
where not anulada and estado_u <> 'EXCLUIDA'
group by 1, 2, 3, 4;
create unique index effi_mv_dia_pk on public.effi_mv_dia (cuenta, fecha_local, transportadora, estado_u);

create materialized view public.effi_mv_ciudad as
select
  cuenta,
  fecha_local,
  coalesce(nombre_provincia_destinatario, '') as provincia,
  coalesce(nombre_ciudad_destinatario, '') as ciudad,
  count(*) as guias,
  count(*) filter (where estado_u = 'ENTREGADO') as entregadas,
  count(*) filter (where estado_u = 'DEVOLUCION') as devoluciones
from public.v_guias
where not anulada and estado_u <> 'EXCLUIDA'
group by 1, 2, 3, 4;
create unique index effi_mv_ciudad_pk on public.effi_mv_ciudad (cuenta, fecha_local, provincia, ciudad);

revoke all on public.effi_mv_dia, public.effi_mv_ciudad from public, anon, authenticated;

-- Refresco sin bloquear lecturas.
create function public.effi_refrescar_resumenes() returns void
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
begin
  refresh materialized view concurrently public.effi_mv_dia;
  refresh materialized view concurrently public.effi_mv_ciudad;
end $$;
revoke all on function public.effi_refrescar_resumenes() from public, anon, authenticated;
select cron.schedule('effi-resumenes', '* * * * *', $$ select public.effi_refrescar_resumenes(); $$);

-- ───────── KPIs sobre los resúmenes (mismas columnas y fórmulas que antes) ─────────

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
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  select d.cuenta, max(a.nombre), max(a.pais), max(a.divisa),
    sum(guias)::bigint,
    sum(guias) filter (where estado_u = 'ENTREGADO')::bigint,
    sum(guias) filter (where estado_u = 'DEVOLUCION')::bigint,
    sum(guias) filter (where estado_u = 'EN_TRANSITO')::bigint,
    sum(guias) filter (where estado_u = 'NOVEDAD')::bigint,
    sum(guias) filter (where estado_u = 'EN_OFICINA')::bigint,
    sum(guias) filter (where estado_u = 'PENDIENTE')::bigint,
    sum(guias) filter (where estado_u = 'INDEMNIZACION')::bigint,
    sum(recuperados)::bigint,
    round(sum(guias) filter (where estado_u = 'ENTREGADO')
      / nullif(sum(guias) filter (where estado_u in ('ENTREGADO', 'DEVOLUCION')), 0), 4),
    round(sum(guias) filter (where estado_u = 'DEVOLUCION')
      / nullif(sum(guias) filter (where estado_u <> 'INDEMNIZACION'), 0), 4),
    sum(recaudo_sum),
    sum(recaudo_sum) filter (where estado_u = 'ENTREGADO'),
    round(sum(recaudo_pos_sum) / nullif(sum(recaudo_pos_n), 0), 2),
    sum(flete_sum),
    round(sum(flete_pos_sum) / nullif(sum(flete_pos_n), 0), 2),
    sum(sin_liquidar)::bigint,
    round((sum(dias_ent_sum) / nullif(sum(dias_ent_n), 0))::numeric, 1),
    round((sum(dias_pago_sum) / nullif(sum(dias_pago_n), 0))::numeric, 1)
  from public.effi_mv_dia d
  join public.effi_accounts a on a.slug = d.cuenta
  where d.cuenta = any (public.app_cuentas_visibles())
    and (p_cuentas is null or d.cuenta = any (p_cuentas))
    and d.fecha_local between p_desde and p_hasta
  group by d.cuenta
  order by d.cuenta;
$$;

create or replace function public.kpi_diario(p_cuentas text[], p_desde date, p_hasta date)
returns table (fecha date, cuenta text, estado_u text, guias bigint)
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  select fecha_local, cuenta, estado_u, sum(guias)::bigint
  from public.effi_mv_dia
  where cuenta = any (public.app_cuentas_visibles())
    and (p_cuentas is null or cuenta = any (p_cuentas))
    and fecha_local between p_desde and p_hasta
  group by 1, 2, 3 order by 1;
$$;

create or replace function public.kpi_transportadoras(p_cuentas text[], p_desde date, p_hasta date)
returns table (
  cuenta text, transportadora text, guias bigint, entregadas bigint, devoluciones bigint, abiertas bigint,
  efectividad numeric, pct_devolucion numeric, flete_promedio numeric, ticket_promedio numeric,
  recaudo_entregado numeric, dias_entrega numeric, dias_pago numeric, sin_liquidar bigint
)
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  select cuenta, transportadora,
    sum(guias)::bigint,
    coalesce(sum(guias) filter (where estado_u = 'ENTREGADO'), 0)::bigint,
    coalesce(sum(guias) filter (where estado_u = 'DEVOLUCION'), 0)::bigint,
    coalesce(sum(guias) filter (where estado_u in ('EN_TRANSITO', 'NOVEDAD', 'EN_OFICINA', 'PENDIENTE')), 0)::bigint,
    round(sum(guias) filter (where estado_u = 'ENTREGADO')
      / nullif(sum(guias) filter (where estado_u in ('ENTREGADO', 'DEVOLUCION')), 0), 4),
    round(coalesce(sum(guias) filter (where estado_u = 'DEVOLUCION'), 0)
      / nullif(sum(guias) filter (where estado_u <> 'INDEMNIZACION'), 0), 4),
    round(sum(flete_pos_sum) / nullif(sum(flete_pos_n), 0), 2),
    round(sum(recaudo_pos_sum) / nullif(sum(recaudo_pos_n), 0), 2),
    sum(recaudo_sum) filter (where estado_u = 'ENTREGADO'),
    round((sum(dias_ent_sum) / nullif(sum(dias_ent_n), 0))::numeric, 1),
    round((sum(dias_pago_sum) / nullif(sum(dias_pago_n), 0))::numeric, 1),
    sum(sin_liquidar)::bigint
  from public.effi_mv_dia
  where cuenta = any (public.app_cuentas_visibles())
    and (p_cuentas is null or cuenta = any (p_cuentas))
    and fecha_local between p_desde and p_hasta
  group by 1, 2 order by 3 desc;
$$;

create or replace function public.kpi_ciudades(p_cuentas text[], p_desde date, p_hasta date, p_min int default 10)
returns table (cuenta text, provincia text, ciudad text, guias bigint, entregadas bigint, devoluciones bigint, efectividad numeric)
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  select cuenta, nullif(provincia, ''), nullif(ciudad, ''),
    sum(guias)::bigint, sum(entregadas)::bigint, sum(devoluciones)::bigint,
    round(sum(entregadas) / nullif(sum(entregadas) + sum(devoluciones), 0), 4)
  from public.effi_mv_ciudad
  where cuenta = any (public.app_cuentas_visibles())
    and (p_cuentas is null or cuenta = any (p_cuentas))
    and fecha_local between p_desde and p_hasta
  group by 1, 2, 3
  having sum(guias) >= p_min
  order by 4 desc
  limit 300;
$$;

-- Listas: filtros que pueden usar índices parciales (antes recorrían todas las guías).
create index if not exists effi_guias_sin_liquidar on public.effi_guias (cuenta, fecha_trans)
  where est_guia_efficommerce = 4 and fecha_recaudo is null and recaudo;
create index if not exists effi_guias_abiertas on public.effi_guias (cuenta, est_guia_efficommerce)
  where est_guia_efficommerce in (2, 3, 8, 9) and fecha_recaudo is null;

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
    and fecha_trans >= p_desde::timestamptz - interval '1 day' and fecha_trans < p_hasta::timestamptz + interval '2 days'
    and fecha_local between p_desde and p_hasta
  order by entregada_en nulls last;
$$;

create or replace function public.kpi_estancadas(p_cuentas text[], p_dias int default 5)
returns table (cuenta text, guia text, estado text, transportadora text, destino text, ultimo_cambio timestamptz, dias numeric, valor_recaudo numeric, divisa text)
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select cuenta, guia, estado_efficommerce, nombre_transportadora_efficommerce,
    concat_ws(', ', nombre_ciudad_destinatario, nombre_provincia_destinatario),
    coalesce(ultimo_cambio_estado, fecha_trans),
    round((extract(epoch from now() - coalesce(ultimo_cambio_estado, fecha_trans)) / 86400)::numeric, 1),
    valor_recaudo, divisa
  from public.v_guias
  where not anulada and est_guia_efficommerce in (2, 3, 8, 9) and fecha_recaudo is null
    and coalesce(ultimo_cambio_estado, fecha_trans) < now() - make_interval(days => p_dias)
    and fecha_trans > now() - interval '90 days'
    and (p_cuentas is null or cuenta = any (p_cuentas))
  order by 7 desc
  limit 500;
$$;
