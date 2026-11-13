-- 🚚 Transportadoras y ciudades (pedido del dueño, 12-nov-2026): además de entregadas y devueltas, la cantidad de guías
-- pendientes (en tránsito, novedad, en oficina o pendientes), en su propia columna. En la efectividad cuentan como si no se
-- hubieran entregado: efectividad = entregadas ÷ (entregadas + devoluciones + pendientes).
drop materialized view if exists public.effi_mv_ciudad;
create materialized view public.effi_mv_ciudad as
  select cuenta, fecha_local,
    coalesce(nombre_provincia_destinatario, '') as provincia,
    coalesce(nombre_ciudad_destinatario, '') as ciudad,
    count(*) as guias,
    count(*) filter (where estado_u = 'ENTREGADO') as entregadas,
    count(*) filter (where estado_u = 'DEVOLUCION') as devoluciones,
    count(*) filter (where estado_u in ('EN_TRANSITO', 'NOVEDAD', 'EN_OFICINA', 'PENDIENTE')) as pendientes
  from public.v_guias
  where not anulada and estado_u <> 'EXCLUIDA'
  group by cuenta, fecha_local, coalesce(nombre_provincia_destinatario, ''), coalesce(nombre_ciudad_destinatario, '');
create unique index effi_mv_ciudad_pk on public.effi_mv_ciudad (cuenta, fecha_local, provincia, ciudad);
revoke all on public.effi_mv_ciudad from anon, authenticated;

drop function if exists public.kpi_ciudades(text[], date, date, integer);
create function public.kpi_ciudades(p_cuentas text[], p_desde date, p_hasta date, p_min integer default 10)
returns table(cuenta text, provincia text, ciudad text, guias bigint, entregadas bigint, devoluciones bigint, pendientes bigint, efectividad numeric)
language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  select cuenta, nullif(provincia, ''), nullif(ciudad, ''),
    sum(guias)::bigint, sum(entregadas)::bigint, sum(devoluciones)::bigint, sum(pendientes)::bigint,
    round(sum(entregadas) / nullif(sum(entregadas) + sum(devoluciones) + sum(pendientes), 0), 4)
  from public.effi_mv_ciudad
  where cuenta = any (public.app_cuentas_visibles())
    and (p_cuentas is null or cuenta = any (p_cuentas))
    and fecha_local between p_desde and p_hasta
  group by 1, 2, 3
  having sum(guias) >= p_min
  order by 4 desc
  limit 300;
$$;
revoke all on function public.kpi_ciudades(text[], date, date, integer) from public, anon;
grant execute on function public.kpi_ciudades(text[], date, date, integer) to authenticated, service_role;

-- Transportadoras: la misma regla (las abiertas ya salían en su columna; ahora cuentan en la efectividad).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.kpi_transportadoras(text[],date,date)'::regprocedure);
  d := replace(d, $r$/ nullif(sum(guias) filter (where estado_u in ('ENTREGADO', 'DEVOLUCION')), 0), 4),$r$,
    $r$/ nullif(sum(guias) filter (where estado_u in ('ENTREGADO', 'DEVOLUCION', 'EN_TRANSITO', 'NOVEDAD', 'EN_OFICINA', 'PENDIENTE')), 0), 4),$r$);
  if position($r$'DEVOLUCION', 'EN_TRANSITO', 'NOVEDAD', 'EN_OFICINA', 'PENDIENTE')), 0), 4)$r$ in d) = 0 then raise exception 'kpi_transportadoras cambió'; end if;
  execute d;
end $$;
