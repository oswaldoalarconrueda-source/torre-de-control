-- Pestaña 📢 Publicidad: todo el gasto de Meta que tiene la Torre (por API y lo que quedó de los CSV), por tienda, día,
-- cuenta publicitaria y campaña, más el estado de la conexión con Meta (portafolios, cuentas y última sincronización).
-- El gasto siempre está en COP. La conexión (tokens y cuentas sin tienda) solo la ve el dueño.
create or replace function public.publicidad_resumen(p_cuentas text[] default null, p_desde date default null, p_hasta date default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with vis as (
    select a.slug from public.effi_accounts a
    where a.tipo = 'tienda' and a.slug = any (public.app_cuentas_visibles('resumen'))
      and (p_cuentas is null or a.slug = any (p_cuentas))
  ),
  api as (select nombre, token, ultima_sync, ultimo_error, estado, divisa from public.meta_cuentas_ads),
  d as (
    select d.* from public.app_publicidad_diaria d join vis on vis.slug = d.cuenta
    where d.fecha between p_desde and p_hasta
  ),
  c as (
    select c.* from public.app_publicidad_campanas c join vis on vis.slug = c.cuenta
    where c.fecha between p_desde and p_hasta
  )
  select jsonb_build_object(
    'total', coalesce((select sum(monto_cop) from d), 0),
    'dias', (p_hasta - p_desde) + 1,
    'ultimo_dia', (select max(fecha) from d),
    'por_tienda', coalesce((select jsonb_agg(x order by x.monto desc) from (
        select cuenta, sum(monto_cop) as monto, count(distinct fecha) as dias, max(fecha) as ultimo,
          count(distinct cuenta_ads) as cuentas_ads
        from d group by 1) x), '[]'::jsonb),
    'por_dia', coalesce((select jsonb_agg(x order by x.fecha, x.cuenta) from (
        select fecha, cuenta, sum(monto_cop) as monto from d group by 1, 2) x), '[]'::jsonb),
    'por_cuenta_ads', coalesce((select jsonb_agg(x order by x.total desc) from (
        select t.cuenta_ads, sum(t.m) as total, jsonb_object_agg(t.cuenta, t.m) as por_tienda, max(t.ultimo) as ultimo,
          (select a.token from api a where a.nombre = t.cuenta_ads limit 1) as portafolio,
          exists (select 1 from api a where a.nombre = t.cuenta_ads) as por_api,
          (select max(a.ultima_sync) from api a where a.nombre = t.cuenta_ads) as ultima_sync,
          (select max(a.ultimo_error) from api a where a.nombre = t.cuenta_ads) as error
        from (select cuenta_ads, cuenta, sum(monto_cop) as m, max(fecha) as ultimo from d group by 1, 2) t
        group by t.cuenta_ads) x), '[]'::jsonb),
    'campanas', coalesce((select jsonb_agg(x order by x.monto desc) from (
        select campana, cuenta_ads, cuenta, sum(monto_cop) as monto, count(distinct fecha) as dias, max(fecha) as ultimo,
          sum(monto_cop) filter (where fecha = (select max(fecha) from c)) as ultimo_monto
        from c group by 1, 2, 3 order by 4 desc limit 300) x), '[]'::jsonb),
    'campanas_total', (select count(distinct (campana, cuenta_ads)) from c),
    'conexion', case when public.app_es_owner() then jsonb_build_object(
        'portafolios', coalesce((select jsonb_agg(x order by x.portafolio) from (
            select coalesce(token, 'meta_access_token') as portafolio, count(*) as cuentas,
              count(*) filter (where ultimo_error is not null) as con_error, max(ultima_sync) as ultima_sync
            from public.meta_cuentas_ads group by 1) x), '[]'::jsonb),
        'cuentas_sin_gasto', coalesce((select jsonb_agg(x order by x.nombre) from (
            select a.nombre, a.token as portafolio, a.estado, a.divisa from public.meta_cuentas_ads a
            where not exists (select 1 from public.app_publicidad_diaria p where p.cuenta_ads = a.nombre and p.fecha between p_desde and p_hasta)) x), '[]'::jsonb),
        'proxima', (select min(t) from (values (date_trunc('hour', now()) + interval '20 minutes'), (date_trunc('hour', now()) + interval '80 minutes')) v(t) where t > now())
      ) else null end
  );
$$;
revoke all on function public.publicidad_resumen(text[], date, date) from public, anon;
grant execute on function public.publicidad_resumen(text[], date, date) to authenticated;
