create function public.app_estado_cargas()
returns table (cuenta text, fuente text, filas bigint, desde date, hasta date)
language sql stable security definer set search_path = '' as $$
  select * from (
    select cuenta, 'Dropi · órdenes' as fuente, count(*), min(fecha), max(fecha) from public.dropi_ordenes group by 1
    union all select cuenta, 'Dropi · productos', count(*), null, null from public.dropi_orden_productos group by 1
    union all select cuenta, 'Dropi · cartera', count(*), min(fecha)::date, max(fecha)::date from public.dropi_cartera group by 1
    union all select cuenta, 'Meta · por campaña', count(*), min(fecha), max(fecha) from public.app_publicidad_campanas group by 1
    union all select cuenta, 'Meta · por día y cuenta', count(*), min(fecha), max(fecha) from public.app_publicidad_diaria group by 1
  ) x
  where public.app_es_owner()
  order by 1, 2;
$$;
revoke all on function public.app_estado_cargas() from public, anon;
grant execute on function public.app_estado_cargas() to authenticated;
