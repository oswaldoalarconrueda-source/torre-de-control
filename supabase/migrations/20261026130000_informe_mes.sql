-- Informe diario con imágenes: además de lo del día (informe_diario), lo acumulado del mes de cada tienda hasta el día
-- del informe: órdenes, guías y en qué estado están (la misma vista effi_mv_dia_dim del "Resumen diario por estados"
-- de Datos, día por día, para dibujar ese cuadro como foto en el correo). Solo el servidor (service_role).
create or replace function public.informe_mes(p_dias_atras integer default 1, p_cuentas text[] default null) returns jsonb
language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with c as (
    select a.slug, a.sociedad, make_interval(mins => a.tz_offset_min) as off,
      ((now() + make_interval(mins => a.tz_offset_min))::date - p_dias_atras) as dia
    from public.effi_accounts a
    where a.tipo = 'tienda' and a.activa and (p_cuentas is null or a.slug = any (p_cuentas))
      and exists (select 1 from public.effi_guias g where g.cuenta = a.slug and g.fecha_trans > now() - interval '30 days')
  ),
  d as (
    select c.*, date_trunc('month', c.dia)::date as mes,
      ((date_trunc('month', c.dia)::date)::timestamp - c.off)::timestamptz as desde_ts,
      (((c.dia + 1))::timestamp - c.off)::timestamptz as hasta_ts
    from c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cuenta', d.slug, 'sociedad', d.sociedad, 'desde', d.mes, 'hasta', d.dia,
    'ordenes', (select count(*) from public.auto_ordenes o where o.cuenta = d.slug and o.fecha_orden >= d.desde_ts and o.fecha_orden < d.hasta_ts),
    'remisiones', (select count(*) from public.auto_ordenes o where o.cuenta = d.slug and o.rem_fecha >= d.desde_ts and o.rem_fecha < d.hasta_ts and o.rem_vigente is not false),
    'estados', (select coalesce(jsonb_object_agg(estado_u, n), '{}'::jsonb) from (
        select m.estado_u, sum(m.guias)::bigint n from public.effi_mv_dia_dim m
        where m.cuenta = d.slug and m.fecha_local between d.mes and d.dia group by 1) x),
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object('f', fecha_local, 'e', estado_u, 'n', n) order by fecha_local), '[]'::jsonb) from (
        select m.fecha_local, m.estado_u, sum(m.guias)::bigint n from public.effi_mv_dia_dim m
        where m.cuenta = d.slug and m.fecha_local between d.mes and d.dia group by 1, 2) y)
  ) order by d.slug), '[]'::jsonb)
  from d;
$$;
revoke all on function public.informe_mes(integer, text[]) from public, anon, authenticated;
grant execute on function public.informe_mes(integer, text[]) to service_role;
