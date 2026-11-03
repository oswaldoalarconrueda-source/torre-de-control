-- Comisiones: el detalle de cada tarjeta (entregadas y pagas, devolución, en tránsito, guías, costo e IVA aparte, pedidos cobrados por
-- Effi) y la lista de remisiones sin costo manual. La regla de la comisión no cambia. prov_comisiones_base trae una fila por remisión.
drop index if exists public.effi_wallet_venta_remision;
create index if not exists effi_wallet_venta_remision on public.effi_wallet (cuenta, id_ref, sucursal_ref)
  where t_trans_ref = 4 and t_movimiento in (3, 16, 34);
create index if not exists effi_guias_transaccion_dropshipping on public.effi_guias (cuenta, transaccion_dropshipping)
  where transaccion_dropshipping is not null;

create or replace function public.prov_comisiones_base(p_cuenta text, p_desde date, p_hasta date)
returns table (id bigint, fecha_trans timestamptz, cliente text, distribuidor text, total numeric, costo_manual numeric,
  grupo text, reversada boolean, cobrada boolean, guia text, estado text, contenido text, guias bigint)
language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with cuenta as (
    select a.slug, make_interval(mins => a.tz_offset_min) as off
    from public.effi_accounts a
    where a.slug = p_cuenta and a.tipo = 'proveeduria' and p_cuenta = any (public.app_cuentas_visibles('proveeduria'))
  ),
  liq as (
    select w.id_ref, w.sucursal_ref, bool_or(w.t_movimiento = 3) as vendida, bool_or(w.t_movimiento = 34) as reversada, bool_or(w.t_movimiento = 16) as cobrada
    from public.effi_wallet w join cuenta c on c.slug = w.cuenta
    where w.t_trans_ref = 4 and w.t_movimiento in (3, 16, 34) and w.vigente is not false
    group by 1, 2
  )
  select r.id, r.fecha_trans, trim(r.cliente), r.distribuidor, r.total, r.costo_manual,
    case
      when coalesce(l.vendida, false) and not coalesce(l.reversada, false) then 'pagada'
      when r.estado_dropshipping = 'Rechazada' then 'rechazada'
      when g.estado ilike 'devoluci%' then 'devolucion'
      when g.estado ilike 'entregada%' then 'entregada'
      else 'transito'
    end,
    coalesce(l.vendida and l.reversada, false), coalesce(l.cobrada, false), g.guia, g.estado, g.contenido, coalesce(n.guias, 0)
  from public.prov_remisiones r
  join cuenta c on c.slug = r.cuenta
  left join liq l on l.id_ref = r.id and l.sucursal_ref = r.sucursal
  left join lateral (
    select x.guia, x.estado_efficommerce as estado, x.contenido
    from public.effi_guias x
    where x.cuenta = r.cuenta and x.transaccion_dropshipping = r.transaccion_dropshipping
    order by (x.vigente is not false) desc, x.id desc limit 1
  ) g on true
  left join lateral (
    select count(*) as guias from public.effi_guias x
    where x.cuenta = r.cuenta and x.transaccion_dropshipping = r.transaccion_dropshipping and x.vigente is not false
  ) n on true
  where r.fecha_trans >= (p_desde::timestamp - c.off)::timestamptz and r.fecha_trans < ((p_hasta + 1)::timestamp - c.off)::timestamptz
    and r.transaccion_dropshipping is not null and r.nombre_centro_costos = 'Principal' and r.total > 0 and r.vigente is not false;
$$;
revoke all on function public.prov_comisiones_base(text, date, date) from public, anon, authenticated;

create or replace function public.prov_comisiones(p_cuenta text, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with tasas as (select 0.12::numeric as iva, 0.01::numeric as effi, 0.10::numeric as comision),
  base as (select * from public.prov_comisiones_base(p_cuenta, p_desde, p_hasta)),
  calc as (
    select b.*, coalesce(b.costo_manual, 0) as costo, coalesce(b.costo_manual, 0) * t.iva as iva, b.total * t.effi as comision_effi,
      b.total - coalesce(b.costo_manual, 0) * (1 + t.iva) - b.total * t.effi as utilidad, t.comision as tasa
    from base b cross join tasas t
    where b.grupo = 'pagada'
  ),
  por_cliente as (
    select min(cliente) as cliente, count(*) as remisiones, sum(total) as total_neto, sum(costo) as costo, sum(iva) as iva, sum(costo + iva) as costo_iva,
      sum(comision_effi) as comision_effi, sum(utilidad) as utilidad, sum(utilidad * tasa) as comision
    from calc group by upper(cliente)
  )
  select jsonb_build_object(
    'filas', (select coalesce(jsonb_agg(to_jsonb(p) order by p.remisiones desc, p.total_neto desc), '[]'::jsonb) from por_cliente p),
    'totales', (select jsonb_build_object('remisiones', count(*), 'total_neto', coalesce(sum(total), 0), 'costo', coalesce(sum(costo), 0), 'iva', coalesce(sum(iva), 0),
      'costo_iva', coalesce(sum(costo + iva), 0), 'comision_effi', coalesce(sum(comision_effi), 0), 'utilidad', coalesce(sum(utilidad), 0),
      'comision', coalesce(sum(utilidad * tasa), 0), 'pedidos_cobrados', count(*) filter (where cobrada), 'guias', coalesce(sum(guias), 0)) from calc),
    'estados', (select jsonb_build_object('total', count(*) filter (where grupo <> 'rechazada'), 'pagadas', count(*) filter (where grupo = 'pagada'),
      'devolucion', count(*) filter (where grupo = 'devolucion'), 'transito', count(*) filter (where grupo = 'transito'),
      'entregadas_sin_pago', count(*) filter (where grupo = 'entregada'), 'rechazadas', count(*) filter (where grupo = 'rechazada'),
      'vendido', coalesce(sum(total) filter (where grupo <> 'rechazada'), 0), 'guias', coalesce(sum(guias) filter (where grupo <> 'rechazada'), 0)) from base),
    'sin_costo', (select count(*) from calc where costo = 0),
    'reversadas', (select count(*) from base where reversada)
  )
  where p_cuenta = any (public.app_cuentas_visibles('proveeduria'));
$$;

-- Remisiones que entran a la comisión sin costo manual en Effi: inflan la utilidad hasta que se corrijan.
create or replace function public.prov_comisiones_sin_costo(p_cuenta text, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'fecha', b.fecha_trans, 'cliente', b.cliente, 'distribuidor', b.distribuidor, 'guia', b.guia,
    'estado', b.estado, 'contenido', b.contenido, 'total', b.total) order by b.fecha_trans desc, b.id desc), '[]'::jsonb)
  from public.prov_comisiones_base(p_cuenta, p_desde, p_hasta) b
  where b.grupo = 'pagada' and coalesce(b.costo_manual, 0) = 0;
$$;
revoke all on function public.prov_comisiones_sin_costo(text, date, date) from public, anon;
grant execute on function public.prov_comisiones_sin_costo(text, date, date) to authenticated;
