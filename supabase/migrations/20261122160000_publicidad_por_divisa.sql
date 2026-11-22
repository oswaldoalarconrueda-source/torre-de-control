-- Pedido del dueño (22-nov-2026): en 📢 Publicidad, cuando las cuentas publicitarias cobran en dólares (u otra moneda),
-- cada país muestra el valor real cobrado por Meta en esa moneda, la conversión a la moneda del país y a pesos.
-- original = pesos guardados ÷ la misma tasa con que meta-gasto los pasó a pesos (la del mes en app_trm_mes; si el mes no
-- tiene, la del último mes). local = moneda del país desde lo cobrado: dólares × moneda del país por dólar del día (con la
-- última tasa anterior si ese día no tiene); las cuentas en pesos se pasan como antes (app_cop_a_local_dia).
drop function if exists public.publicidad_por_divisa(text[], date, date);
create function public.publicidad_por_divisa(p_cuentas text[] default null, p_desde date default null, p_hasta date default null)
returns table (cuenta text, divisa text, original numeric, cop numeric, cuentas_ads bigint, local numeric)
language sql stable security definer set search_path to '' as $function$
  with vis as (
    select a.slug, a.divisa as div_pais from public.effi_accounts a
    where a.tipo = 'tienda' and a.slug = any (public.app_cuentas_visibles('resumen'))
      and exists (select 1 from public.app_usuarios u where u.user_id = (select auth.uid()) and u.activo and u.rol in ('owner', 'socio'))
      and (p_cuentas is null or a.slug = any (p_cuentas))
  ),
  f as (
    select d.cuenta, d.fecha, d.cuenta_ads, d.monto_cop, vis.div_pais, coalesce(m.divisa, 'COP') as div_ads,
      case coalesce(m.divisa, 'COP')
        when 'COP' then d.monto_cop
        when 'USD' then d.monto_cop / nullif(t.usd_cop, 0)
        when 'GTQ' then d.monto_cop / nullif(t.gtq_cop, 0)
      end as original,
      td.usd_gtq, td.usd_hnl, td.usd_crc
    from public.app_publicidad_diaria d
    join vis on vis.slug = d.cuenta
    left join public.meta_cuentas_ads m on m.nombre = d.cuenta_ads
    left join lateral (
      select x.usd_cop, x.gtq_cop from public.app_trm_mes x
      order by (to_char(x.mes, 'YYYY-MM') = to_char(d.fecha, 'YYYY-MM')) desc, x.mes desc limit 1) t on true
    -- Si el día no tiene tasa (p. ej. lempiras, que llegan con la billetera de Drop), la última anterior.
    left join lateral (select
        (select x.usd_gtq from public.app_trm_dia x where x.fecha <= d.fecha and x.usd_gtq is not null order by x.fecha desc limit 1) as usd_gtq,
        (select x.usd_hnl from public.app_trm_dia x where x.fecha <= d.fecha and x.usd_hnl is not null order by x.fecha desc limit 1) as usd_hnl,
        (select x.usd_crc from public.app_trm_dia x where x.fecha <= d.fecha and x.usd_crc is not null order by x.fecha desc limit 1) as usd_crc) td on true
    where d.fecha between p_desde and p_hasta
  )
  select cuenta, div_ads, sum(original), sum(monto_cop), count(distinct cuenta_ads),
    sum(case
          when div_ads = div_pais then original
          when div_ads = 'USD' then original * case div_pais when 'GTQ' then usd_gtq when 'HNL' then usd_hnl when 'CRC' then usd_crc end
          else public.app_cop_a_local_dia(cuenta, monto_cop, fecha)
        end)
  from f group by 1, 2
$function$;
revoke all on function public.publicidad_por_divisa(text[], date, date) from public, anon;
grant execute on function public.publicidad_por_divisa(text[], date, date) to authenticated;
