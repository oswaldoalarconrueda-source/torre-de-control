-- "Resumen diario por estados" (como en el Dashboard Joalix): guías por día y estado con filtros de
-- transportadora, centro de costos y proveedor. Vista materializada que se refresca cada minuto.

create materialized view public.effi_mv_dia_dim as
select
  cuenta,
  fecha_local,
  estado_u,
  coalesce(nombre_transportadora_efficommerce, nombre_transportadora, 'Sin transportadora') as transportadora,
  -- Regla de la skill: todo pedido recuperado (destinatario con "*") va a "Recuperado"; Effi usa
  -- un nombre distinto por país para ese centro de costos, así que se unifican.
  case
    when recuperado or nombre_centro_costos in ('Pedidos Recuperados', 'Recuperado', 'VENTAS RECUPERADAS') then 'Recuperado'
    else coalesce(nombre_centro_costos, 'Sin centro de costos')
  end as centro_costos,
  coalesce(nombre_empresa_proveedor, 'Sin proveedor') as proveedor,
  count(*) as guias
from public.v_guias
where not anulada and estado_u <> 'EXCLUIDA'
group by 1, 2, 3, 4, 5, 6;
create unique index effi_mv_dia_dim_pk on public.effi_mv_dia_dim (cuenta, fecha_local, estado_u, transportadora, centro_costos, proveedor);
revoke all on public.effi_mv_dia_dim from public, anon, authenticated;

create or replace function public.effi_refrescar_resumenes() returns void
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
begin
  refresh materialized view concurrently public.effi_mv_dia;
  refresh materialized view concurrently public.effi_mv_ciudad;
  refresh materialized view concurrently public.effi_mv_dia_dim;
end $$;

-- Guías por día y estado, con filtros opcionales (null = todos).
create function public.kpi_diario_dim(
  p_cuentas text[], p_desde date, p_hasta date,
  p_transportadoras text[] default null, p_centros text[] default null, p_proveedores text[] default null
) returns table (fecha date, estado_u text, guias bigint)
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  select fecha_local, estado_u, sum(guias)::bigint
  from public.effi_mv_dia_dim
  where cuenta = any (public.app_cuentas_visibles())
    and (p_cuentas is null or cuenta = any (p_cuentas))
    and fecha_local between p_desde and p_hasta
    and (p_transportadoras is null or transportadora = any (p_transportadoras))
    and (p_centros is null or centro_costos = any (p_centros))
    and (p_proveedores is null or proveedor = any (p_proveedores))
  group by 1, 2 order by 1;
$$;

-- Opciones de cada desplegable: solo lo que tiene guías en el periodo y países elegidos.
create function public.kpi_opciones_dim(p_cuentas text[], p_desde date, p_hasta date)
returns table (dimension text, valor text, guias bigint)
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with base as (
    select * from public.effi_mv_dia_dim
    where cuenta = any (public.app_cuentas_visibles())
      and (p_cuentas is null or cuenta = any (p_cuentas))
      and fecha_local between p_desde and p_hasta
  )
  select 'transportadora', transportadora, sum(guias)::bigint from base group by 2
  union all select 'centro_costos', centro_costos, sum(guias)::bigint from base group by 2
  union all select 'proveedor', proveedor, sum(guias)::bigint from base group by 2
  order by 1, 3 desc;
$$;

revoke all on function public.kpi_diario_dim(text[], date, date, text[], text[], text[]) from public, anon;
grant execute on function public.kpi_diario_dim(text[], date, date, text[], text[], text[]) to authenticated, service_role;
revoke all on function public.kpi_opciones_dim(text[], date, date) from public, anon;
grant execute on function public.kpi_opciones_dim(text[], date, date) to authenticated, service_role;
