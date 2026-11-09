-- Honduras: COP → lempiras con la TRM del mes (app_trm_mes), como Guatemala y Ecuador y como el proyecto anterior de
-- A un clic (lo pidió el dueño el 9-nov-2026). Antes usaba el promedio de la TRM diaria y la pauta pesaba ~2 % más.
-- Lempiras por dólar: promedio del mes de la tasa de la billetera de Drop (provisional hasta la real).
create or replace function public.app_cop_a_local(p_cuenta text, p_cop numeric, p_mes date) returns numeric
language sql stable set search_path = '' as $$
  select case
    when p_cuenta = 'TIENDA_CO' then p_cop
    when p_cuenta = 'TIENDA_CR' then (
      select p_cop / avg(d.usd_cop) * avg(d.usd_crc)
      from public.app_trm_dia d
      where d.usd_crc is not null and d.fecha between
        coalesce((select min(x.fecha) from public.app_trm_dia x where x.fecha >= p_mes and x.fecha < p_mes + interval '1 month' and x.usd_crc is not null),
                 (select max(x.fecha) from public.app_trm_dia x where x.fecha < p_mes and x.usd_crc is not null))
        and coalesce((select max(x.fecha) from public.app_trm_dia x where x.fecha >= p_mes and x.fecha < p_mes + interval '1 month' and x.usd_crc is not null),
                 (select max(x.fecha) from public.app_trm_dia x where x.fecha < p_mes and x.usd_crc is not null)))
    when t.mes is null then null
    when p_cuenta = 'AUNCLIC_HN' then p_cop / t.usd_cop * coalesce(
      (select avg(x.usd_hnl) from public.app_trm_dia x where x.fecha >= p_mes and x.fecha < p_mes + interval '1 month' and x.usd_hnl is not null),
      (select x.usd_hnl from public.app_trm_dia x where x.usd_hnl is not null order by abs(x.fecha - p_mes) limit 1))
    when p_cuenta in ('TIENDA_GT', 'AUNCLIC_GT', 'VALKA_GT') then p_cop / t.gtq_cop
    when p_cuenta in ('TIENDA_EC', 'AUNCLIC_SV') then p_cop / t.usd_cop
  end
  from (select 1) uno
  left join lateral (
    select * from public.app_trm_mes where mes <= p_mes order by mes desc limit 1
  ) t on true;
$$;
