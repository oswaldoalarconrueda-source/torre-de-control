-- 🌎 Global (como la pestaña Global del Dashboard Joalix): todos los países juntos para el mismo calendario.
-- Es la única vista que suma países, porque el usuario lo pidió así. Las cantidades se suman tal cual; los montos
-- se suman solo después de convertirlos a una moneda común con la TRM del mes (app_trm_mes).
--
-- Devuelve una fila por país, día de creación (hora local de cada país) y estado unificado, con el número de
-- ventas (guías Effi y órdenes Dropi) y su valor en la moneda del país. Mismas reglas que kpi_despacho: sin
-- anuladas ni canceladas de Dropi; la venta de una guía es su recaudo o, si no tiene recaudo, el valor declarado.

create function public.kpi_global(p_cuentas text[] default null, p_desde date default null, p_hasta date default null,
                                  p_plataforma text default 'ambas') returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with permitidas as (
    select slug from public.effi_accounts
    where tipo = 'tienda' and activa and slug = any (public.app_cuentas_visibles())
      and (p_cuentas is null or slug = any (p_cuentas))
  ),
  filas as (
    select v.cuenta, v.fecha_local as fecha, v.estado_u as estado, 'effi' as plataforma,
      coalesce(nullif(v.valor_recaudo, 0), v.valor_declarado, 0) as venta
    from public.v_guias v
    where v.cuenta in (select slug from permitidas) and p_plataforma in ('ambas', 'effi')
      and v.fecha_trans >= p_desde::timestamptz - interval '1 day' and v.fecha_trans < p_hasta::timestamptz + interval '2 days'
      and v.fecha_local between p_desde and p_hasta
      and not v.anulada and v.estado_u <> 'EXCLUIDA'
    union all
    select d.cuenta, d.fecha, d.estado_u, 'dropi', coalesce(d.venta, 0)
    from public.v_dropi_ordenes d
    where d.cuenta in (select slug from permitidas) and p_plataforma in ('ambas', 'dropi')
      and d.fecha between p_desde and p_hasta and d.estado_u <> 'EXCLUIDA'
  )
  select jsonb_build_object(
    'filas', coalesce((select jsonb_agg(jsonb_build_object('cuenta', cuenta, 'fecha', fecha, 'estado', estado, 'n', n, 'venta', venta)
                                         order by fecha, cuenta, estado)
                       from (select cuenta, fecha, estado, count(*) as n, sum(venta) as venta from filas group by 1, 2, 3) x), '[]'::jsonb),
    -- Primer día con ventas de cada país (para avisar si el periodo anterior está incompleto).
    'primer_dia', coalesce((select jsonb_object_agg(cuenta, primero) from (
        select cuenta, min(fecha_local) as primero from public.v_guias where cuenta in (select slug from permitidas) group by 1) p), '{}'::jsonb),
    -- TRM de cada mes del rango (y la vigente antes del rango): pesos colombianos por dólar y por quetzal.
    'trm', coalesce((select jsonb_agg(jsonb_build_object('mes', mes, 'usd_cop', usd_cop, 'gtq_cop', gtq_cop, 'estimada', estimada) order by mes)
                     from public.app_trm_mes
                     where mes <= p_hasta and mes >= coalesce((select max(mes) from public.app_trm_mes where mes <= p_desde), p_desde)), '[]'::jsonb)
  );
$$;
revoke all on function public.kpi_global(text[], date, date, text) from public, anon;
grant execute on function public.kpi_global(text[], date, date, text) to authenticated;
