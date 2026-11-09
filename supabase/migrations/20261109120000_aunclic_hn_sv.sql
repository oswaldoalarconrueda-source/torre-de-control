-- 🇭🇳 🇸🇻 A un clic también opera en Honduras y El Salvador (lo dijo el dueño el 9-nov-2026). Dos tiendas nuevas de la
-- sociedad, sin cuenta de Effi por ahora (los procesos de Effi las saltan porque no tienen llave): por ahora solo
-- llevan su publicidad. Se muestran en dólares (moneda de El Salvador; Honduras también en USD mientras no haya TRM de
-- lempiras).
insert into public.effi_accounts (slug, nombre, tipo, pais, divisa, activa, empresa_id, tz_offset_min, sociedad, wallet_base) values
  ('AUNCLIC_HN', 'A UN CLIC HN', 'tienda', 'HN', 'USD', true, null, -360, 'A un clic', 0),
  ('AUNCLIC_SV', 'A UN CLIC SV', 'tienda', 'SV', 'USD', true, null, -360, 'A un clic', 0)
on conflict (slug) do nothing;

-- COP → moneda local: Honduras y El Salvador en dólares, como Ecuador.
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
    when p_cuenta in ('TIENDA_GT', 'AUNCLIC_GT', 'VALKA_GT') then p_cop / t.gtq_cop
    when p_cuenta in ('TIENDA_EC', 'AUNCLIC_HN', 'AUNCLIC_SV') then p_cop / t.usd_cop
  end
  from (select 1) uno
  left join lateral (
    select * from public.app_trm_mes where mes <= p_mes order by mes desc limit 1
  ) t on true;
$$;

create or replace function public.app_cop_a_local_dia(p_cuenta text, p_cop numeric, p_fecha date) returns numeric
language sql stable security definer set search_path = '' as $$
  with t as (select usd_cop, usd_gtq, usd_crc from public.app_trm_dia where fecha <= p_fecha order by fecha desc limit 1),
  a as (select pais from public.effi_accounts where slug = p_cuenta)
  select case (select pais from a)
    when 'CO' then p_cop
    when 'EC' then p_cop / nullif((select usd_cop from t), 0)
    when 'HN' then p_cop / nullif((select usd_cop from t), 0)
    when 'SV' then p_cop / nullif((select usd_cop from t), 0)
    when 'GT' then p_cop / nullif((select usd_cop from t), 0) * (select usd_gtq from t)
    when 'CR' then p_cop / nullif((select usd_cop from t), 0) * (select usd_crc from t)
  end;
$$;

-- Meta → tienda: el gasto va a la tienda de la sociedad del portafolio en el país de entrega. La "tienda" del
-- portafolio (meta_portafolios.tienda) queda solo para los países donde esa sociedad no tiene tienda (A un clic: lo que
-- no sea Guatemala, Honduras ni El Salvador sigue yendo a AUNCLIC_GT).
create or replace function public.meta_guardar(p_filas jsonb, p_cuentas_ads text[], p_desde date, p_hasta date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_n integer; v_omitidas integer;
begin
  drop table if exists pg_temp._meta;
  create temp table _meta on commit drop as
  with r as (
    select r.*, coalesce(p.sociedad, 'Joalix AA Group') as soc, p.tienda as ptienda, p.desde as pdesde
    from jsonb_to_recordset(p_filas) as r(pais text, fecha date, cuenta_ads text, campana text, monto_cop numeric)
    left join lateral (select p.sociedad, p.tienda, p.desde from public.meta_cuentas_ads m join public.meta_portafolios p on p.token = m.token
                       where m.nombre = btrim(r.cuenta_ads) limit 1) p on true
  )
  select a.slug as cuenta, r.fecha, btrim(r.cuenta_ads) as cuenta_ads, r.campana, sum(r.monto_cop) as monto_cop
  from r
  join public.effi_accounts a on a.tipo = 'tienda' and a.sociedad = r.soc
    and (a.pais = r.pais
         or (a.slug = r.ptienda and not exists (select 1 from public.effi_accounts b
                                                where b.tipo = 'tienda' and b.sociedad = r.soc and b.pais = r.pais)))
  where r.fecha between p_desde and p_hasta and r.fecha >= coalesce(r.pdesde, r.fecha)
  group by 1, 2, 3, 4;
  v_n := jsonb_array_length(p_filas);
  v_omitidas := v_n - (select count(*) from jsonb_to_recordset(p_filas) as r(pais text, fecha date, cuenta_ads text)
    left join lateral (select p.sociedad, p.tienda, p.desde from public.meta_cuentas_ads m join public.meta_portafolios p on p.token = m.token
                       where m.nombre = btrim(r.cuenta_ads) limit 1) p on true
    where exists (select 1 from public.effi_accounts a where a.tipo = 'tienda' and a.sociedad = coalesce(p.sociedad, 'Joalix AA Group')
                  and (a.pais = r.pais or (a.slug = p.tienda and not exists (select 1 from public.effi_accounts b
                        where b.tipo = 'tienda' and b.sociedad = coalesce(p.sociedad, 'Joalix AA Group') and b.pais = r.pais)))));

  delete from public.app_publicidad_campanas c
  where c.cuenta_ads = any (p_cuentas_ads) and c.fecha between p_desde and p_hasta;
  insert into public.app_publicidad_campanas (cuenta, fecha, cuenta_ads, campana, monto_cop, carga_id)
  select cuenta, fecha, cuenta_ads, campana, monto_cop, null from pg_temp._meta;

  delete from public.app_publicidad_diaria d
  where d.cuenta_ads = any (p_cuentas_ads) and d.fecha between p_desde and p_hasta;
  insert into public.app_publicidad_diaria (cuenta, fecha, cuenta_ads, monto_cop)
  select cuenta, fecha, cuenta_ads, sum(monto_cop) from pg_temp._meta group by 1, 2, 3;

  delete from public.app_publicidad_campanas c using public.meta_cuentas_ads a where a.excluir and c.cuenta_ads = a.nombre;
  delete from public.app_publicidad_diaria d using public.meta_cuentas_ads a where a.excluir and d.cuenta_ads = a.nombre;

  return jsonb_build_object('filas', v_n - v_omitidas, 'omitidas', v_omitidas,
    'por_tienda', (select coalesce(jsonb_object_agg(cuenta, round(t)), '{}'::jsonb) from (select cuenta, sum(monto_cop) t from pg_temp._meta group by 1) x));
end $$;
revoke all on function public.meta_guardar(jsonb, text[], date, date) from public, anon, authenticated;
grant execute on function public.meta_guardar(jsonb, text[], date, date) to service_role;
