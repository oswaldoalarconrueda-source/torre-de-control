-- 💵 Flujo de Caja (pedido del dueño, 12-nov-2026): por día, lo que se gastó en publicidad (Meta, en la moneda del país
-- con la tasa del día) frente a lo que entró a la wallet de Effi ese día. La wallet manda: cada liquidación de guía trae
-- el recaudo (+) y, en la misma hora, el costo del producto, el flete y el fulfillment (−); lo que queda es el ingreso
-- neto del día. Los retiros a la cuenta bancaria y las transferencias entre wallets no son ingreso ni gasto (es la misma
-- plata que se mueve) y van aparte. El día es el de la hora local del país. Solo dueño y socios, con las tiendas que ven en Dinero.
create or replace function public.flujo_caja_diario(p_cuentas text[] default null, p_desde date default null, p_hasta date default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with vis as (
    select a.slug, a.pais, case when a.pais in ('GT', 'CR', 'HN', 'SV') then interval '6 hours' else interval '5 hours' end as off
    from public.effi_accounts a
    where a.tipo = 'tienda' and a.slug = any (public.app_cuentas_visibles('dinero'))
      and exists (select 1 from public.app_usuarios u where u.user_id = (select auth.uid()) and u.activo and u.rol in ('owner', 'socio'))
      and (p_cuentas is null or a.slug = any (p_cuentas))
  ),
  r as (select coalesce(p_desde, (now() - interval '5 hours')::date - 29) as d, coalesce(p_hasta, (now() - interval '5 hours')::date) as h),
  w as (
    select w.cuenta, (w.fecha_trans - v.off)::date as fecha,
      (coalesce(w.tipo_origen, '') ilike '%retiro%' or coalesce(w.tipo_origen, '') ilike '%transferencia%' or coalesce(w.tipo_movimiento, '') ilike 'retiro%') as retiro,
      w.tipo_movimiento, w.valor
    from public.effi_wallet w join vis v on v.slug = w.cuenta
    where w.fecha_trans >= (select d from r) - interval '1 day' and w.fecha_trans < (select h from r) + interval '2 days'
  ),
  wd as (
    select cuenta, fecha,
      sum(valor) filter (where not retiro and tipo_movimiento ilike 'recaudo%') as recaudo,
      sum(valor) filter (where not retiro and not (tipo_movimiento ilike 'recaudo%')) as descuentos,
      sum(valor) filter (where not retiro) as neto,
      sum(valor) filter (where retiro) as retiros,
      count(*) filter (where not retiro and tipo_movimiento ilike 'recaudo%') as guias
    from w where fecha between (select d from r) and (select h from r)
    group by 1, 2
  ),
  ad as (
    select d.cuenta, d.fecha, sum(d.monto_cop) as ads_cop, sum(public.app_cop_a_local_dia(d.cuenta, d.monto_cop, d.fecha)) as ads
    from public.app_publicidad_diaria d join vis v on v.slug = d.cuenta
    where d.fecha between (select d from r) and (select h from r)
    group by 1, 2
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cuenta', coalesce(wd.cuenta, ad.cuenta), 'fecha', coalesce(wd.fecha, ad.fecha),
    'ads', ad.ads, 'ads_cop', ad.ads_cop, 'recaudo', coalesce(wd.recaudo, 0), 'descuentos', coalesce(wd.descuentos, 0),
    'neto', coalesce(wd.neto, 0), 'retiros', coalesce(wd.retiros, 0), 'guias', coalesce(wd.guias, 0)
  ) order by coalesce(wd.fecha, ad.fecha) desc, coalesce(wd.cuenta, ad.cuenta)), '[]'::jsonb)
  from wd full join ad on ad.cuenta = wd.cuenta and ad.fecha = wd.fecha;
$$;
revoke all on function public.flujo_caja_diario(text[], date, date) from public, anon;
grant execute on function public.flujo_caja_diario(text[], date, date) to authenticated;
