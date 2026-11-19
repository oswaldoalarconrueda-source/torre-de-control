-- Wallet en vivo, 19-nov-2026: además de la wallet de Effi, la billetera de Dropi de cada país que la tenga (Joalix Guatemala,
-- Joalix Colombia, A un clic Guatemala). Sale del historial de cartera cargado (dropi_cartera): saldo = último movimiento
-- (monto previo + valor). Cada sociedad ve las suyas (app_cuentas_visibles). Se marca con origen 'dropi'.
-- Los movimientos se muestran con un nombre fijo por concepto: la descripción de Dropi puede traer correos de otros usuarios.

create or replace function public.wallet_en_vivo(p_cuentas text[] default null::text[]) returns jsonb
language sql stable security definer set search_path to '' set "TimeZone" to 'UTC' as $function$
  with c as (
    select a.slug, a.tz_offset_min, a.wallet_base, a.divisa as divisa_cuenta, a.empresa_id is null as es_drop,
      (((now() + make_interval(mins => a.tz_offset_min))::date)::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz as inicio
    from public.effi_accounts a
    where a.tipo in ('tienda', 'proveeduria') and a.activa
      and a.slug = any (public.app_cuentas_visibles('dinero'))
      and (p_cuentas is null or a.slug = any (p_cuentas))
  )
  , t as (
    select c.*, c.wallet_base + coalesce(sum(w.valor), 0) as saldo, count(w.id) as n, min(w.fecha_trans) as desde, max(w.fecha_trans) as ultimo
    from c left join public.effi_wallet w on w.cuenta = c.slug
    where not c.es_drop
    group by c.slug, c.tz_offset_min, c.inicio, c.wallet_base, c.divisa_cuenta, c.es_drop
  )
  , dc as (
    select c.slug, x.id, x.valor, x.concepto, x.concepto_retiro, x.orden_id, x.descripcion, x.monto_previo,
      (x.fecha - make_interval(mins => c.tz_offset_min)) at time zone 'UTC' as f
    from c join public.dropi_cartera x on x.cuenta = c.slug
    where c.es_drop
  )
  , td as (
    select c.*, (select d.monto_previo + d.valor from dc d where d.slug = c.slug and d.monto_previo is not null order by d.f desc, d.id desc limit 1) as saldo,
      (select count(*) from dc d where d.slug = c.slug) as n,
      (select min(d.f) from dc d where d.slug = c.slug) as desde, (select max(d.f) from dc d where d.slug = c.slug) as ultimo
    from c where c.es_drop
  )
  -- Billetera de Dropi de las tiendas que también tienen Effi.
  , di as (
    select c.slug, x.id, x.valor, x.concepto, x.orden_id, x.descripcion, x.monto_previo,
      (x.fecha - make_interval(mins => c.tz_offset_min)) at time zone 'UTC' as f
    from c join public.dropi_cartera x on x.cuenta = c.slug
    where not c.es_drop
  )
  , tdi as (
    select c.*, (select d.monto_previo + d.valor from di d where d.slug = c.slug and d.monto_previo is not null order by d.f desc, d.id desc limit 1) as saldo,
      (select count(*) from di d where d.slug = c.slug) as n,
      (select min(d.f) from di d where d.slug = c.slug) as desde, (select max(d.f) from di d where d.slug = c.slug) as ultimo
    from c where not c.es_drop and exists (select 1 from di d where d.slug = c.slug)
  )
  select jsonb_build_object('ahora', now(), 'cuentas', coalesce(jsonb_agg(x order by x->>'cuenta', x->>'origen' nulls first), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'cuenta', c.slug,
      'divisa', (select w.divisa from public.effi_wallet w where w.cuenta = c.slug order by w.fecha_trans desc limit 1),
      'saldo', c.saldo,
      'movimientos_total', c.n,
      'desde', c.desde,
      'ultimo', c.ultimo,
      'hoy', (select jsonb_build_object(
          'entradas', coalesce(sum(w.valor) filter (where w.valor > 0), 0),
          'salidas', coalesce(sum(w.valor) filter (where w.valor < 0), 0),
          'neto', coalesce(sum(w.valor), 0),
          'movimientos', count(*),
          'recaudos', count(*) filter (where w.t_movimiento in (1, 3) and w.vigente is not false),
          'recaudo', coalesce(sum(w.valor) filter (where w.t_movimiento in (1, 3) and w.vigente is not false), 0))
        from public.effi_wallet w where w.cuenta = c.slug and w.fecha_trans >= c.inicio),
      'serie', (select jsonb_agg(c.saldo - coalesce(d.despues, 0) order by k desc)
          from generate_series(0, 24) k
          left join lateral (select sum(w.valor) as despues from public.effi_wallet w
                             where w.cuenta = c.slug and w.fecha_trans > now() - make_interval(hours => k)) d on true),
      'recientes', (select coalesce(jsonb_agg(m order by m.fecha desc), '[]'::jsonb) from (
          select w.fecha_trans as fecha, w.tipo_movimiento as tipo, w.t_movimiento as t, w.valor, w.guia_inicial as guia,
            w.vigente is false as anulado
          from public.effi_wallet w where w.cuenta = c.slug
          order by w.fecha_trans desc, w.id desc limit 30) m)
    ) as x
    from t c
    union all
    select jsonb_build_object(
      'cuenta', c.slug,
      'divisa', c.divisa_cuenta,
      'saldo', coalesce(c.saldo, 0),
      'movimientos_total', c.n,
      'desde', c.desde,
      'ultimo', c.ultimo,
      'origen', 'drop',
      'hoy', (select jsonb_build_object(
          'entradas', coalesce(sum(d.valor) filter (where d.valor > 0), 0),
          'salidas', coalesce(sum(d.valor) filter (where d.valor < 0), 0),
          'neto', coalesce(sum(d.valor), 0),
          'movimientos', count(*),
          'recaudos', count(*) filter (where d.concepto = 'ganancia'),
          'recaudo', coalesce(sum(d.valor) filter (where d.concepto = 'ganancia'), 0))
        from dc d where d.slug = c.slug and d.f >= c.inicio),
      'serie', (select jsonb_agg(coalesce(c.saldo, 0) - coalesce(s.despues, 0) order by k desc)
          from generate_series(0, 24) k
          left join lateral (select sum(d.valor) as despues from dc d where d.slug = c.slug and d.f > now() - make_interval(hours => k)) s on true),
      'recientes', (select coalesce(jsonb_agg(m order by m.fecha desc), '[]'::jsonb) from (
          select d.f as fecha,
            case d.concepto when 'ganancia' then 'Abono por liquidación de envío' when 'flete_dev' then 'Descuento por no entrega'
              when 'retiro' then 'Retiro (pendiente de pesos y cuenta)' else regexp_replace(coalesce(d.descripcion, ''), '^.*Drop: ', '') end as tipo,
            null::int as t, d.valor,
            case when d.concepto = 'retiro' then d.concepto_retiro else 'Orden ' || d.orden_id end as guia,
            false as anulado
          from dc d where d.slug = c.slug
          order by d.f desc, d.id desc limit 30) m),
      'retiros', (select coalesce(jsonb_agg(jsonb_build_object('fecha', d.f, 'concepto', d.concepto_retiro, 'monto', -d.valor) order by d.f desc), '[]'::jsonb)
          from dc d where d.slug = c.slug and d.concepto = 'retiro')
    )
    from td c
    union all
    select jsonb_build_object(
      'cuenta', c.slug,
      'divisa', c.divisa_cuenta,
      'saldo', coalesce(c.saldo, 0),
      'movimientos_total', c.n,
      'desde', c.desde,
      'ultimo', c.ultimo,
      'origen', 'dropi',
      'hoy', (select jsonb_build_object(
          'entradas', coalesce(sum(d.valor) filter (where d.valor > 0), 0),
          'salidas', coalesce(sum(d.valor) filter (where d.valor < 0), 0),
          'neto', coalesce(sum(d.valor), 0),
          'movimientos', count(*),
          'recaudos', count(*) filter (where d.concepto = 'ganancia'),
          'recaudo', coalesce(sum(d.valor) filter (where d.concepto = 'ganancia'), 0))
        from di d where d.slug = c.slug and d.f >= c.inicio),
      'serie', (select jsonb_agg(coalesce(c.saldo, 0) - coalesce(s.despues, 0) order by k desc)
          from generate_series(0, 24) k
          left join lateral (select sum(d.valor) as despues from di d where d.slug = c.slug and d.f > now() - make_interval(hours => k)) s on true),
      'recientes', (select coalesce(jsonb_agg(m order by m.fecha desc), '[]'::jsonb) from (
          select d.f as fecha,
            case d.concepto
              when 'ganancia' then 'Ganancia de orden entregada'
              when 'flete_dev' then case when d.descripcion ilike '%FLETE INICIAL%' then 'Cobro de flete inicial' else 'Cobro de devolución' end
              when 'garantia_entrada' then 'Entrada por garantía'
              when 'garantia_salida' then 'Salida por garantía'
              when 'correccion' then 'Corrección de estado'
              when 'retiro' then 'Retiro de cartera'
              when 'transferencia' then 'Transferencia entre wallets'
              when 'recarga' then 'Recarga de wallet'
              else 'Otro movimiento' end as tipo,
            null::int as t, d.valor,
            case when d.orden_id is not null then 'Orden ' || d.orden_id end as guia,
            false as anulado
          from di d where d.slug = c.slug
          order by d.f desc, d.id desc limit 30) m)
    )
    from tdi c
  ) y;
$function$;
