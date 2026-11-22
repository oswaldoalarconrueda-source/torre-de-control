-- Pedido del dueño (22-nov-2026): en 📢 Publicidad siempre las tres monedas (la de las cuentas en dólares, la del país y pesos).
-- Desde hoy meta-gasto pasa dólares y quetzales a pesos con la tasa del día (app_trm_dia), así que dólares = pesos ÷ TRM del día.
-- (Aplicado como migración «publicidad_tres_monedas».)
create or replace function public.app_cop_a_usd_dia(p_monto numeric, p_fecha date) returns numeric language sql stable set search_path to '' as $$
  select p_monto / nullif((select t.usd_cop from public.app_trm_dia t where t.fecha <= p_fecha and t.usd_cop is not null order by t.fecha desc limit 1), 0)
$$;

do $do$
declare d text := pg_get_functiondef('public.publicidad_resumen(text[],date,date)'::regprocedure); v text;
  r text[][] := array[
    ['select d.*, public.app_cop_a_local_dia(d.cuenta, d.monto_cop, d.fecha) as local', 'select d.*, public.app_cop_a_local_dia(d.cuenta, d.monto_cop, d.fecha) as local, public.app_cop_a_usd_dia(d.monto_cop, d.fecha) as usd'],
    ['select c.*, public.app_cop_a_local_dia(c.cuenta, c.monto_cop, c.fecha) as local', 'select c.*, public.app_cop_a_local_dia(c.cuenta, c.monto_cop, c.fecha) as local, public.app_cop_a_usd_dia(c.monto_cop, c.fecha) as usd'],
    ['select cuenta, sum(monto_cop) as monto, sum(local) as local, count(*) filter', 'select cuenta, sum(monto_cop) as monto, sum(local) as local, sum(usd) as usd, count(*) filter'],
    ['sum(d.monto_cop) as monto, sum(d.local) as local, t.usd_cop', 'sum(d.monto_cop) as monto, sum(d.local) as local, sum(d.usd) as usd, t.usd_cop'],
    ['jsonb_object_agg(t.cuenta, t.l) as por_tienda_local,', 'jsonb_object_agg(t.cuenta, t.l) as por_tienda_local, jsonb_object_agg(t.cuenta, t.u) as por_tienda_usd,'],
    ['sum(monto_cop) as m, sum(local) as l, max(fecha) as ultimo from d group by 1, 2', 'sum(monto_cop) as m, sum(local) as l, sum(usd) as u, max(fecha) as ultimo from d group by 1, 2'],
    ['select campana, cuenta_ads, cuenta, sum(monto_cop) as monto, sum(local) as local, count(distinct fecha)', 'select campana, cuenta_ads, cuenta, sum(monto_cop) as monto, sum(local) as local, sum(usd) as usd, count(distinct fecha)']
  ];
  i int;
begin
  for i in 1 .. array_length(r, 1) loop
    v := d; d := replace(d, r[i][1], r[i][2]);
    if d = v then raise exception 'publicidad_resumen: no se encontró %', r[i][1]; end if;
  end loop;
  execute d;
end $do$;

-- publicidad_por_divisa: el original en dólares sale con la tasa del día (como lo hace ahora meta-gasto).
do $do$
declare d text := pg_get_functiondef('public.publicidad_por_divisa(text[],date,date)'::regprocedure); v text := d;
begin
  d := replace(d, $a$    left join lateral (
      select x.usd_cop, x.gtq_cop from public.app_trm_mes x
      order by (to_char(x.mes, 'YYYY-MM') = to_char(d.fecha, 'YYYY-MM')) desc, x.mes desc limit 1) t on true$a$,
  $a$    left join lateral (
      select x.usd_cop, x.usd_cop / nullif(x.usd_gtq, 0) as gtq_cop from public.app_trm_dia x
      where x.fecha <= d.fecha and x.usd_cop is not null order by x.fecha desc limit 1) t on true$a$);
  if d = v then raise exception 'publicidad_por_divisa: tasa del mes'; end if;
  execute d;
end $do$;
