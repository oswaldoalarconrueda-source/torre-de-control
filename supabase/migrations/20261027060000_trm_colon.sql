-- Costa Rica en colones: la TRM diaria trae también colones por dólar (venta, publicada por Banguat).
alter table public.app_trm_dia add column if not exists usd_crc numeric;

create or replace function public.app_cop_a_local_dia(p_cuenta text, p_cop numeric, p_fecha date) returns numeric
language sql stable security definer set search_path = '' as $$
  with t as (select usd_cop, usd_gtq, usd_crc from public.app_trm_dia where fecha <= p_fecha order by fecha desc limit 1),
  a as (select pais from public.effi_accounts where slug = p_cuenta)
  select case (select pais from a)
    when 'CO' then p_cop
    when 'EC' then p_cop / nullif((select usd_cop from t), 0)
    when 'GT' then p_cop / nullif((select usd_cop from t), 0) * (select usd_gtq from t)
    when 'CR' then p_cop / nullif((select usd_cop from t), 0) * (select usd_crc from t)
  end;
$$;

-- El detalle por día de Publicidad trae también la tasa del colón.
do $$
begin
  execute replace(replace(pg_get_functiondef('public.publicidad_resumen(text[], date, date)'::regprocedure),
    'select d.fecha, d.cuenta, sum(d.monto_cop) as monto, sum(d.local) as local, t.usd_cop, t.usd_gtq',
    'select d.fecha, d.cuenta, sum(d.monto_cop) as monto, sum(d.local) as local, t.usd_cop, t.usd_gtq, t.usd_crc'),
    'left join lateral (select usd_cop, usd_gtq from public.app_trm_dia where fecha <= d.fecha order by fecha desc limit 1) t on true
        group by 1, 2, t.usd_cop, t.usd_gtq)',
    'left join lateral (select usd_cop, usd_gtq, usd_crc from public.app_trm_dia where fecha <= d.fecha order by fecha desc limit 1) t on true
        group by 1, 2, t.usd_cop, t.usd_gtq, t.usd_crc)');
end $$;
