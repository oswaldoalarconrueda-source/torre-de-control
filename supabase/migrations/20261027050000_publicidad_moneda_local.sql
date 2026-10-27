-- 📢 Publicidad también en la moneda de cada país, con la TRM del día del gasto (app_trm_dia): Guatemala en quetzales,
-- Ecuador en dólares, Colombia en pesos. Cada cifra trae "local" junto al monto en COP, y el detalle por día trae las
-- tasas usadas (pesos por dólar y quetzales por dólar). Reúne lo de las migraciones anteriores: solo dueño y socios,
-- cuentas excluidas fuera de la conexión.
create or replace function public.publicidad_resumen(p_cuentas text[] default null, p_desde date default null, p_hasta date default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with vis as (
    select a.slug from public.effi_accounts a
    where a.tipo = 'tienda' and a.slug = any (public.app_cuentas_visibles('resumen'))
      and exists (select 1 from public.app_usuarios u where u.user_id = (select auth.uid()) and u.activo and u.rol in ('owner', 'socio'))
      and (p_cuentas is null or a.slug = any (p_cuentas))
  ),
  api as (select nombre, token, ultima_sync, ultimo_error, estado, divisa from public.meta_cuentas_ads),
  d as (
    select d.*, public.app_cop_a_local_dia(d.cuenta, d.monto_cop, d.fecha) as local
    from public.app_publicidad_diaria d join vis on vis.slug = d.cuenta
    where d.fecha between p_desde and p_hasta
  ),
  c as (
    select c.*, public.app_cop_a_local_dia(c.cuenta, c.monto_cop, c.fecha) as local
    from public.app_publicidad_campanas c join vis on vis.slug = c.cuenta
    where c.fecha between p_desde and p_hasta
  )
  select jsonb_build_object(
    'total', coalesce((select sum(monto_cop) from d), 0),
    'dias', (p_hasta - p_desde) + 1,
    'ultimo_dia', (select max(fecha) from d),
    'por_tienda', coalesce((select jsonb_agg(x order by x.monto desc) from (
        select cuenta, sum(monto_cop) as monto, sum(local) as local, count(*) filter (where local is null) as sin_tasa,
          count(distinct fecha) as dias, max(fecha) as ultimo, count(distinct cuenta_ads) as cuentas_ads
        from d group by 1) x), '[]'::jsonb),
    'por_dia', coalesce((select jsonb_agg(x order by x.fecha, x.cuenta) from (
        select d.fecha, d.cuenta, sum(d.monto_cop) as monto, sum(d.local) as local, t.usd_cop, t.usd_gtq
        from d left join lateral (select usd_cop, usd_gtq from public.app_trm_dia where fecha <= d.fecha order by fecha desc limit 1) t on true
        group by 1, 2, t.usd_cop, t.usd_gtq) x), '[]'::jsonb),
    'por_cuenta_ads', coalesce((select jsonb_agg(x order by x.total desc) from (
        select t.cuenta_ads, sum(t.m) as total, jsonb_object_agg(t.cuenta, t.m) as por_tienda,
          jsonb_object_agg(t.cuenta, t.l) as por_tienda_local, max(t.ultimo) as ultimo,
          (select a.token from api a where a.nombre = t.cuenta_ads limit 1) as portafolio,
          exists (select 1 from api a where a.nombre = t.cuenta_ads) as por_api,
          (select max(a.ultima_sync) from api a where a.nombre = t.cuenta_ads) as ultima_sync,
          (select max(a.ultimo_error) from api a where a.nombre = t.cuenta_ads) as error
        from (select cuenta_ads, cuenta, sum(monto_cop) as m, sum(local) as l, max(fecha) as ultimo from d group by 1, 2) t
        group by t.cuenta_ads) x), '[]'::jsonb),
    'campanas', coalesce((select jsonb_agg(x order by x.monto desc) from (
        select campana, cuenta_ads, cuenta, sum(monto_cop) as monto, sum(local) as local, count(distinct fecha) as dias, max(fecha) as ultimo
        from c group by 1, 2, 3 order by 4 desc limit 300) x), '[]'::jsonb),
    'campanas_total', (select count(distinct (campana, cuenta_ads)) from c),
    'conexion', case when public.app_es_owner() then jsonb_build_object(
        'portafolios', coalesce((select jsonb_agg(x order by x.portafolio) from (
            select coalesce(token, 'meta_access_token') as portafolio, count(*) as cuentas,
              count(*) filter (where ultimo_error is not null) as con_error, max(ultima_sync) as ultima_sync
            from public.meta_cuentas_ads where not excluir group by 1) x), '[]'::jsonb),
        'cuentas_sin_gasto', coalesce((select jsonb_agg(x order by x.nombre) from (
            select a.nombre, a.token as portafolio, a.estado, a.divisa from public.meta_cuentas_ads a
            where not a.excluir and not exists (select 1 from public.app_publicidad_diaria p where p.cuenta_ads = a.nombre and p.fecha between p_desde and p_hasta)) x), '[]'::jsonb),
        'proxima', (select min(t) from (values (date_trunc('hour', now()) + interval '20 minutes'), (date_trunc('hour', now()) + interval '80 minutes')) v(t) where t > now())
      ) else null end
  );
$$;
revoke all on function public.publicidad_resumen(text[], date, date) from public, anon;
grant execute on function public.publicidad_resumen(text[], date, date) to authenticated;
