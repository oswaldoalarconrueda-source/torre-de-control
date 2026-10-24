-- 🪙 Wallet en vivo: el saldo es la suma de TODOS los movimientos, también los anulados.
-- Cuando Effi anula un movimiento (por ejemplo un retiro rechazado), deja el original como anulado y además crea
-- un "Débito revertido" / "Crédito revertido" por el mismo valor con signo contrario. Si se quita el anulado y se
-- suma la reversión, la devolución queda contada dos veces (Ecuador daba $50.349 y Effi muestra $42.405).
-- Sumando todo, cada par anulado + reversión se cancela y el saldo coincide con el de Effi.

create or replace function public.wallet_en_vivo(p_cuentas text[] default null) returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with c as (
    select a.slug, a.tz_offset_min,
      (((now() + make_interval(mins => a.tz_offset_min))::date)::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz as inicio
    from public.effi_accounts a
    where a.tipo = 'tienda' and a.activa
      and a.slug = any (public.app_cuentas_visibles('dinero'))
      and (p_cuentas is null or a.slug = any (p_cuentas))
  )
  , t as (
    select c.*, coalesce(sum(w.valor), 0) as saldo, count(w.id) as n, min(w.fecha_trans) as desde, max(w.fecha_trans) as ultimo
    from c left join public.effi_wallet w on w.cuenta = c.slug
    group by c.slug, c.tz_offset_min, c.inicio
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
          'recaudos', count(*) filter (where w.t_movimiento = 1 and w.vigente is not false),
          'recaudo', coalesce(sum(w.valor) filter (where w.t_movimiento = 1 and w.vigente is not false), 0))
        from public.effi_wallet w where w.cuenta = c.slug and w.fecha_trans >= c.inicio),
      -- Saldo al cierre de cada hora de las últimas 24 (el último punto es el saldo actual).
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
  ) y;
$$;
