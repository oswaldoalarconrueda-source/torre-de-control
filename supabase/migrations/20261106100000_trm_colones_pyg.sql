-- Costa Rica (5-nov): el gasto de Meta salía en la pestaña Publicidad (tasa del día, app_trm_dia) pero no en Data
-- Experience, porque app_cop_a_local no sabía pasar de COP a colones y devolvía null. Para Costa Rica se usa el promedio
-- del mes en app_trm_dia (COP → USD → CRC); si el mes aún no tiene tasas, las últimas que haya. A un clic y Valka (GTQ)
-- se convierten igual que Joalix Guatemala.
create or replace function public.app_cop_a_local(p_cuenta text, p_cop numeric, p_mes date)
returns numeric language sql stable set search_path = '' as $$
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
    when p_cuenta in ('TIENDA_GT', 'AUNCLIC_GT', 'VALKA_GT') then p_cop / t.gtq_cop
    when p_cuenta = 'TIENDA_EC' then p_cop / t.usd_cop
  end
  from (select 1) uno
  left join lateral (
    select * from public.app_trm_mes where mes <= p_mes order by mes desc limit 1
  ) t on true;
$$;
