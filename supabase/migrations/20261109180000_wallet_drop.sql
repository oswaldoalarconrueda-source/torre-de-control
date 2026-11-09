-- 🪙 Wallet en vivo: las tiendas sin Effi (A un clic Honduras y El Salvador) muestran su billetera de Drop, que se carga
-- por archivo en dropi_cartera (lo pidió el dueño el 9-nov-2026: los retiros van al módulo de Wallet). Saldo = último
-- "saldo resultante"; los retiros salen marcados con su solicitud. La fecha de la cartera está en hora local.
create or replace function public.wallet_en_vivo(p_cuentas text[] default null) returns jsonb
language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with c as (
    select a.slug, a.tz_offset_min, a.wallet_base, a.divisa as divisa_cuenta, a.empresa_id is null as es_drop,
      (((now() + make_interval(mins => a.tz_offset_min))::date)::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz as inicio
    from public.effi_accounts a
    where a.tipo in ('tienda', 'proveeduria') and a.activa
      and a.slug = any (public.app_cuentas_visibles('dinero'))
      and (p_cuentas is null or a.slug = any (p_cuentas))
  )
  -- Effi (como siempre)
  , t as (
    select c.*, c.wallet_base + coalesce(sum(w.valor), 0) as saldo, count(w.id) as n, min(w.fecha_trans) as desde, max(w.fecha_trans) as ultimo
    from c left join public.effi_wallet w on w.cuenta = c.slug
    where not c.es_drop
    group by c.slug, c.tz_offset_min, c.inicio, c.wallet_base, c.divisa_cuenta, c.es_drop
  )
  -- Drop: la cartera con la fecha pasada a UTC
  , dc as (
    select c.slug, x.id, x.valor, x.concepto, x.concepto_retiro, x.orden_id, x.descripcion, x.monto_previo,
      (x.fecha - make_interval(mins => c.tz_offset_min)) at time zone 'UTC' as f
    from c join public.dropi_cartera x on x.cuenta = c.slug
    where c.es_drop
  )
  , td as (
    select c.*, (select d.monto_previo + d.valor from dc d where d.slug = c.slug order by d.f desc, d.id desc limit 1) as saldo,
      (select count(*) from dc d where d.slug = c.slug) as n,
      (select min(d.f) from dc d where d.slug = c.slug) as desde, (select max(d.f) from dc d where d.slug = c.slug) as ultimo
    from c where c.es_drop
  )
  select jsonb_build_object('ahora', now(), 'cuentas', coalesce(jsonb_agg(x order by x->>'cuenta'), '[]'::jsonb))
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
  ) y;
$$;
