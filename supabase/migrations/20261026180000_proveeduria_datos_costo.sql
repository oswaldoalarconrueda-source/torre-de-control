-- Datos de la proveeduría con el mismo formato de las tiendas: además de lo que ya daba prov_datos, el % de costo de la
-- mercancía de la proveeduría (costo ÷ ventas de los indicadores de Effi) para el periodo guardado que mejor cubra el
-- rango pedido (hoy, ayer, 7 días, este mes o mes anterior; si ninguno lo cubre, el de este mes).
create or replace function public.prov_costo_pct(p_cuenta text, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('pct', (i.datos->'kpis'->>'costo')::numeric / nullif((i.datos->'kpis'->>'ventas')::numeric, 0),
      'periodo', i.periodo, 'desde', i.desde, 'hasta', i.hasta)
    from public.prov_indicadores i
    where i.cuenta = p_cuenta and i.bloque = 'ventas' and p_cuenta = any (public.app_cuentas_visibles())
      and (i.desde <= p_desde and i.hasta >= p_hasta or i.periodo = 'mes')
    order by (i.desde <= p_desde and i.hasta >= p_hasta) desc, (i.hasta - i.desde)
    limit 1), '{}'::jsonb);
$$;
revoke all on function public.prov_costo_pct(text, date, date) from public, anon;
grant execute on function public.prov_costo_pct(text, date, date) to authenticated;
