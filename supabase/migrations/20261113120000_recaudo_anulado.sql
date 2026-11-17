-- Data Experience (revisión del dueño, 13-nov-2026): si Effi anula el recaudo de una guía (revierte la liquidación porque al
-- final fue devolución) y no queda ningún recaudo vigente, la guía deja de contar como pagada/entregada. Antes la fecha de
-- recaudo se quedaba puesta: en Guatemala la B264125121-1 salía entregada siendo devolución (Effi 2.169 vs. 2.171).
create or replace function public.effi_refrescar_recaudo(p_cuenta text, p_guias text[])
returns void language sql security definer set search_path = '' as $$
  update public.effi_guias g
  set fecha_recaudo = w.fecha, valor_recaudado = w.valor
  from (
    select m.guia_inicial, min(m.fecha_trans) as fecha, sum(m.valor) as valor
    from public.effi_wallet m
    where m.cuenta = p_cuenta and m.t_movimiento = 1 and m.vigente is not false and m.guia_inicial = any (p_guias)
    group by m.guia_inicial
  ) w
  where g.cuenta = p_cuenta and g.guia = w.guia_inicial
    and (g.fecha_recaudo is distinct from w.fecha or g.valor_recaudado is distinct from w.valor);
  update public.effi_guias g
  set fecha_recaudo = null, valor_recaudado = null
  where g.cuenta = p_cuenta and g.guia = any (p_guias) and g.fecha_recaudo is not null
    and not exists (select 1 from public.effi_wallet m
      where m.cuenta = g.cuenta and m.guia_inicial = g.guia and m.t_movimiento = 1 and m.vigente is not false);
$$;

-- Las que ya quedaron así (13-nov: solo la B264125121-1 de Guatemala).
update public.effi_guias g
set fecha_recaudo = null, valor_recaudado = null
where g.fecha_recaudo is not null
  and not exists (select 1 from public.effi_wallet m
    where m.cuenta = g.cuenta and m.guia_inicial = g.guia and m.t_movimiento = 1 and m.vigente is not false);
