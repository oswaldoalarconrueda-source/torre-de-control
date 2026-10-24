-- El resumen de recaudo de la guía (effi_guias.fecha_recaudo / valor_recaudado) quedaba vacío cuando el
-- pago llegaba al wallet antes de que la guía existiera en la tabla (la guía entra después por el historial
-- de estados, que no refrescaba el recaudo). Resultado: guías pagadas que salían como "sin liquidar".
-- Arreglo: cada minuto se completan las guías con recaudo en el wallet que aún no lo tienen marcado.

create index if not exists effi_guias_sin_recaudo on public.effi_guias (cuenta, guia) where fecha_recaudo is null and recaudo;

create function public.effi_reparar_recaudo() returns integer
language sql security definer set search_path = '' as $$
  with w as (
    select m.cuenta, m.guia_inicial, min(m.fecha_trans) as fecha, sum(m.valor) as valor
    from public.effi_wallet m
    join public.effi_guias g on g.cuenta = m.cuenta and g.guia = m.guia_inicial
    where g.fecha_recaudo is null and g.recaudo
      and m.t_movimiento = 1 and m.vigente is not false
    group by 1, 2
  ),
  u as (
    update public.effi_guias g set fecha_recaudo = w.fecha, valor_recaudado = w.valor
    from w where g.cuenta = w.cuenta and g.guia = w.guia_inicial and g.fecha_recaudo is null
    returning 1
  )
  select count(*)::int from u;
$$;
revoke all on function public.effi_reparar_recaudo() from public, anon, authenticated;

create or replace function public.effi_refrescar_resumenes() returns void
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
begin
  perform public.effi_reparar_recaudo();
  refresh materialized view concurrently public.effi_mv_dia;
  refresh materialized view concurrently public.effi_mv_ciudad;
  refresh materialized view concurrently public.effi_mv_dia_dim;
  refresh materialized view concurrently public.effi_mv_guia_wallet;
end $$;

select public.effi_reparar_recaudo();
