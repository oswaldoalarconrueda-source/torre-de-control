-- Comisión del encargado de la proveeduría, igual que el Excel de cada mes: por remisión, costo manual + IVA (× 1,12), 1% que cobra
-- Effi por el modelo drop, utilidad = total neto − costo − 1%, y comisión = 10% de la utilidad. Entran las remisiones con convenio
-- de dropshipping creadas en el periodo cuya venta ya está en la wallet (movimiento 3); no entran las reversadas (movimiento 34).
create index if not exists effi_wallet_venta_remision on public.effi_wallet (cuenta, id_ref, sucursal_ref)
  where t_trans_ref = 4 and t_movimiento in (3, 34);

create or replace function public.prov_comisiones(p_cuenta text, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with tasas as (select 1.12::numeric as iva, 0.01::numeric as effi, 0.10::numeric as comision),
  cuenta as (
    select a.slug, make_interval(mins => a.tz_offset_min) as off
    from public.effi_accounts a
    where a.slug = p_cuenta and a.tipo = 'proveeduria' and p_cuenta = any (public.app_cuentas_visibles('proveeduria'))
  ),
  liq as (
    select w.id_ref, w.sucursal_ref, bool_or(w.t_movimiento = 3) as vendida, bool_or(w.t_movimiento = 34) as reversada
    from public.effi_wallet w join cuenta c on c.slug = w.cuenta
    where w.t_trans_ref = 4 and w.t_movimiento in (3, 34) and w.vigente is not false
    group by 1, 2
  ),
  base as (
    select upper(trim(r.cliente)) as clave, trim(r.cliente) as cliente, r.total, r.costo_manual, l.reversada
    from public.prov_remisiones r
    join cuenta c on c.slug = r.cuenta
    join liq l on l.id_ref = r.id and l.sucursal_ref = r.sucursal and l.vendida
    where r.fecha_trans >= (p_desde::timestamp - c.off)::timestamptz and r.fecha_trans < ((p_hasta + 1)::timestamp - c.off)::timestamptz
      and r.transaccion_dropshipping is not null and r.nombre_centro_costos = 'Principal' and r.total > 0 and r.vigente is not false
  ),
  calc as (
    select b.*, coalesce(b.costo_manual, 0) * t.iva as costo_iva, b.total * t.effi as comision_effi,
      b.total - coalesce(b.costo_manual, 0) * t.iva - b.total * t.effi as utilidad, t.comision
    from base b cross join tasas t
    where not b.reversada
  ),
  por_cliente as (
    select min(cliente) as cliente, count(*) as remisiones, sum(total) as total_neto, sum(costo_iva) as costo_iva,
      sum(comision_effi) as comision_effi, sum(utilidad) as utilidad, sum(utilidad * comision) as comision
    from calc group by clave
  )
  select jsonb_build_object(
    'filas', (select coalesce(jsonb_agg(to_jsonb(p) order by p.remisiones desc, p.total_neto desc), '[]'::jsonb) from por_cliente p),
    'totales', (select jsonb_build_object('remisiones', count(*), 'total_neto', coalesce(sum(total), 0), 'costo_iva', coalesce(sum(costo_iva), 0),
      'comision_effi', coalesce(sum(comision_effi), 0), 'utilidad', coalesce(sum(utilidad), 0), 'comision', coalesce(sum(utilidad * comision), 0)) from calc),
    'sin_costo', (select count(*) from calc where coalesce(costo_manual, 0) = 0),
    'reversadas', (select count(*) from base where reversada)
  )
  where exists (select 1 from cuenta);
$$;
revoke all on function public.prov_comisiones(text, date, date) from public, anon;
grant execute on function public.prov_comisiones(text, date, date) to authenticated;
