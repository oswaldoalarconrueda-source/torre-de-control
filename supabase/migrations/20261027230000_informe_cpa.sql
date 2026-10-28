-- Correo "URGENTE · CPA REAL DEL DÍA": a las 5 a. m. Colombia, gasto de Meta de ayer ÷ pedidos de LucidSales de ayer
-- (📝 Pedidos Lucid), por país, con los últimos 7 días y el mes. Sale por la misma función informe-diario, con
-- informe_programado.tipo = 'cpa'. Los destinatarios se ponen por SQL (no van al repo).
alter table public.informe_programado add column if not exists tipo text not null default 'diario';

create or replace function public.informe_cpa(p_dia date, p_sociedad text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with t as (
    select a.slug as cuenta from public.effi_accounts a
    where a.tipo = 'tienda' and a.activa and (p_sociedad is null or a.sociedad = p_sociedad)
  ),
  per as (
    select t.cuenta, x.desde, x.clave from t
    cross join (values (p_dia, 'dia'), (p_dia - 6, 'semana'), (date_trunc('month', p_dia)::date, 'mes')) as x(desde, clave)
  ),
  g as (
    select per.cuenta, per.clave,
      coalesce((select sum(d.monto_cop) from public.app_publicidad_diaria d
                where d.cuenta = per.cuenta and d.fecha between per.desde and p_dia
                  and exists (select 1 from public.app_pedidos_diarios p where p.cuenta = d.cuenta and p.fecha = d.fecha)), 0) as gasto,
      coalesce((select sum(p.pedidos) from public.app_pedidos_diarios p where p.cuenta = per.cuenta and p.fecha between per.desde and p_dia), 0) as pedidos,
      coalesce((select sum(d.monto_cop) from public.app_publicidad_diaria d where d.cuenta = per.cuenta and d.fecha between per.desde and p_dia), 0) as gasto_total
    from per
  )
  -- En semana y mes el gasto solo cuenta los días que tienen pedidos cargados (si no, el CPA se inflaría).
  select coalesce(jsonb_agg(fila order by cuenta), '[]'::jsonb) from (
    select cuenta, jsonb_build_object('cuenta', cuenta,
      'dia', jsonb_build_object('gasto', round(max(gasto_total) filter (where clave = 'dia')), 'pedidos', max(pedidos) filter (where clave = 'dia')),
      'semana', jsonb_build_object('gasto', round(max(gasto) filter (where clave = 'semana')), 'pedidos', max(pedidos) filter (where clave = 'semana')),
      'mes', jsonb_build_object('gasto', round(max(gasto) filter (where clave = 'mes')), 'pedidos', max(pedidos) filter (where clave = 'mes'))) as fila
    from g group by cuenta
    having max(gasto_total) > 0 or max(pedidos) > 0
  ) s;
$$;
revoke all on function public.informe_cpa(date, text) from public, anon, authenticated;

-- Programación: 5:00 a. m. Colombia (10:00 UTC). La fila 'joalix_cpa' (tipo 'cpa', destinatarios por SQL) se crea
-- apagada y se activa cuando la función informe-diario con el correo de CPA ya está desplegada.
select cron.schedule('informe-cpa-5am', '0 10 * * *', $$ select public.informe_programado_enviar('joalix_cpa'); $$);
