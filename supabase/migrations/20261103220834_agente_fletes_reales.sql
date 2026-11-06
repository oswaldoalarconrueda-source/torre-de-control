create or replace function public.auto_fletes_reales(p_cuenta text, p_remitente integer, p_ciudad text, p_dpto text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'flete', flete, 'guias', guias)), '[]'::jsonb) from (
    select case g.transportadora_efficommerce when 3 then 4 when 4 then 6 when 6 then 10 else g.transportadora_efficommerce end id,
      round((percentile_cont(0.5) within group (order by g.valor_flete))::numeric) flete, count(*) guias
    from public.effi_guias g
    where g.cuenta = p_cuenta and g.fecha_trans >= now() - interval '45 days' and g.vigente and g.recaudo and g.valor_flete > 0
      and g.nombre_ciudad_destinatario = p_ciudad and g.nombre_provincia_destinatario = p_dpto
      and p_cuenta = any (public.app_cuentas_visibles('automatizacion'))
      and exists (select 1 from public.auto_remitentes r where r.cuenta = p_cuenta and r.id = p_remitente and r.ciudad = 'BOGOTA')
    group by 1
  ) x;
$$;
revoke all on function public.auto_fletes_reales(text, integer, text, text) from public, anon;
grant execute on function public.auto_fletes_reales(text, integer, text, text) to authenticated;
