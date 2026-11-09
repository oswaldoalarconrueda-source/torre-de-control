-- País de entrega de cada campaña y día (lo que reporta Meta), para saber qué gasto cae en una tienda por no haber
-- tienda de la sociedad en ese país (p. ej. A un clic en Colombia). Si varias filas de países distintos van a la misma
-- tienda, quedan juntas ("CO,US").
alter table public.app_publicidad_campanas add column if not exists pais text;

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
  select a.slug as cuenta, r.fecha, btrim(r.cuenta_ads) as cuenta_ads, r.campana, sum(r.monto_cop) as monto_cop,
    string_agg(distinct r.pais, ',' order by r.pais) as pais
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
  insert into public.app_publicidad_campanas (cuenta, fecha, cuenta_ads, campana, monto_cop, carga_id, pais)
  select cuenta, fecha, cuenta_ads, campana, monto_cop, null, pais from pg_temp._meta;

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
