-- kpi_resumen: los conteos sin filas devuelven 0 en vez de null.
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
    coalesce(sum(guias), 0)::bigint,
    coalesce(sum(guias) filter (where estado_u = 'ENTREGADO'), 0)::bigint,
    coalesce(sum(guias) filter (where estado_u = 'DEVOLUCION'), 0)::bigint,
    coalesce(sum(guias) filter (where estado_u = 'EN_TRANSITO'), 0)::bigint,
    coalesce(sum(guias) filter (where estado_u = 'NOVEDAD'), 0)::bigint,
    coalesce(sum(guias) filter (where estado_u = 'EN_OFICINA'), 0)::bigint,
    coalesce(sum(guias) filter (where estado_u = 'PENDIENTE'), 0)::bigint,
    coalesce(sum(guias) filter (where estado_u = 'INDEMNIZACION'), 0)::bigint,
    coalesce(sum(recuperados), 0)::bigint,
    round(sum(guias) filter (where estado_u = 'ENTREGADO')
      / nullif(sum(guias) filter (where estado_u in ('ENTREGADO', 'DEVOLUCION')), 0), 4),
    round(coalesce(sum(guias) filter (where estado_u = 'DEVOLUCION'), 0)
      / nullif(sum(guias) filter (where estado_u <> 'INDEMNIZACION'), 0), 4),
    sum(recaudo_sum),
    sum(recaudo_sum) filter (where estado_u = 'ENTREGADO'),
    round(sum(recaudo_pos_sum) / nullif(sum(recaudo_pos_n), 0), 2),
    sum(flete_sum),
    round(sum(flete_pos_sum) / nullif(sum(flete_pos_n), 0), 2),
    coalesce(sum(sin_liquidar), 0)::bigint,
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
