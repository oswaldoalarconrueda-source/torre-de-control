-- Resumen diario por estados con el filtro de plataforma (Ambas / Effi / Otra P). Antes solo leía guías de Effi
-- y no cambiaba al escoger "Otra P". Las órdenes de la segunda plataforma entran por su fecha de orden con el mismo
-- estado unificado del resto de la Torre (v_dropi_ordenes: la cartera manda). No tienen centro de costos ni proveedor
-- en Effi: se agrupan como "Otra P" (o "Recuperado").
-- El default es 'effi' para que la pantalla publicada, que todavía no manda la plataforma, se vea igual que antes.
drop function if exists public.kpi_diario_dim(text[], date, date, text[], text[], text[]);
drop function if exists public.kpi_opciones_dim(text[], date, date);

create function public.kpi_diario_dim(p_cuentas text[], p_desde date, p_hasta date, p_transportadoras text[] default null,
  p_centros text[] default null, p_proveedores text[] default null, p_plataforma text default 'effi')
returns table(fecha date, estado_u text, guias bigint)
language sql stable security definer set search_path to '' set "TimeZone" to 'UTC'
as $$
  with base as (
    select fecha_local, estado_u, transportadora, centro_costos, proveedor, guias
    from public.effi_mv_dia_dim
    where p_plataforma in ('ambas', 'effi')
      and cuenta = any (public.app_cuentas_visibles())
      and (p_cuentas is null or cuenta = any (p_cuentas))
      and fecha_local between p_desde and p_hasta
    union all
    select d.fecha, d.estado_u, coalesce(d.transportadora, 'Sin transportadora'),
      case when d.recuperado then 'Recuperado' else 'Otra P' end, 'Otra P', 1
    from public.v_dropi_ordenes d
    where p_plataforma in ('ambas', 'dropi')
      and d.cuenta = any (public.app_cuentas_visibles())
      and (p_cuentas is null or d.cuenta = any (p_cuentas))
      and d.fecha between p_desde and p_hasta
      and d.estado_u <> 'EXCLUIDA'
  )
  select fecha_local, estado_u, sum(guias)::bigint
  from base
  where (p_transportadoras is null or transportadora = any (p_transportadoras))
    and (p_centros is null or centro_costos = any (p_centros))
    and (p_proveedores is null or proveedor = any (p_proveedores))
  group by 1, 2 order by 1;
$$;

create function public.kpi_opciones_dim(p_cuentas text[], p_desde date, p_hasta date, p_plataforma text default 'effi')
returns table(dimension text, valor text, guias bigint)
language sql stable security definer set search_path to '' set "TimeZone" to 'UTC'
as $$
  with base as (
    select transportadora, centro_costos, proveedor, guias
    from public.effi_mv_dia_dim
    where p_plataforma in ('ambas', 'effi')
      and cuenta = any (public.app_cuentas_visibles())
      and (p_cuentas is null or cuenta = any (p_cuentas))
      and fecha_local between p_desde and p_hasta
    union all
    select coalesce(d.transportadora, 'Sin transportadora'), case when d.recuperado then 'Recuperado' else 'Otra P' end, 'Otra P', 1
    from public.v_dropi_ordenes d
    where p_plataforma in ('ambas', 'dropi')
      and d.cuenta = any (public.app_cuentas_visibles())
      and (p_cuentas is null or d.cuenta = any (p_cuentas))
      and d.fecha between p_desde and p_hasta
      and d.estado_u <> 'EXCLUIDA'
  )
  select 'transportadora', transportadora, sum(guias)::bigint from base group by 2
  union all select 'centro_costos', centro_costos, sum(guias)::bigint from base group by 2
  union all select 'proveedor', proveedor, sum(guias)::bigint from base group by 2
  order by 1, 3 desc;
$$;

revoke all on function public.kpi_diario_dim(text[], date, date, text[], text[], text[], text) from public, anon;
revoke all on function public.kpi_opciones_dim(text[], date, date, text) from public, anon;
grant execute on function public.kpi_diario_dim(text[], date, date, text[], text[], text[], text) to authenticated, service_role;
grant execute on function public.kpi_opciones_dim(text[], date, date, text) to authenticated, service_role;
