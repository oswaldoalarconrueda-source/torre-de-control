-- 🌎 Global · mes a mes: pedidos de cada mes por país y estado, para comparar los meses entre sí.
-- "hasta_dia" cuenta solo los días 1..p_dia de cada mes, para comparar el mes en curso contra los mismos días
-- del mes anterior (un mes a medias contra uno completo daría un crecimiento falso).
-- Mismas reglas que kpi_global: guías Effi por día local de creación + órdenes Dropi, sin anuladas.

create function public.kpi_global_meses(p_cuentas text[] default null, p_plataforma text default 'ambas', p_dia integer default 31)
returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with permitidas as (
    select slug from public.effi_accounts
    where tipo = 'tienda' and activa and slug = any (public.app_cuentas_visibles())
      and (p_cuentas is null or slug = any (p_cuentas))
  ),
  filas as (
    select v.cuenta, v.fecha_local as fecha, v.estado_u as estado
    from public.v_guias v
    where v.cuenta in (select slug from permitidas) and p_plataforma in ('ambas', 'effi')
      and not v.anulada and v.estado_u <> 'EXCLUIDA'
    union all
    select d.cuenta, d.fecha, d.estado_u
    from public.v_dropi_ordenes d
    where d.cuenta in (select slug from permitidas) and p_plataforma in ('ambas', 'dropi') and d.estado_u <> 'EXCLUIDA'
  )
  select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'cuenta', cuenta, 'estado', estado, 'n', n, 'hasta_dia', hasta_dia)
                            order by mes, cuenta, estado), '[]'::jsonb)
  from (
    select date_trunc('month', fecha)::date as mes, cuenta, estado, count(*) as n,
      count(*) filter (where extract(day from fecha) <= p_dia) as hasta_dia
    from filas group by 1, 2, 3
  ) x;
$$;
revoke all on function public.kpi_global_meses(text[], text, integer) from public, anon;
grant execute on function public.kpi_global_meses(text[], text, integer) to authenticated;
