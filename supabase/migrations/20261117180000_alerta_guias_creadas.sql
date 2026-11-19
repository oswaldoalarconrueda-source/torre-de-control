-- 🔔 Alerta "Venta con guía" (pedido del dueño, 17-nov-2026): cada guía nueva de Effi en las tiendas, con la bandera, el valor
-- y el total del día (guías y valor). Si en un minuto salen más de 5 de un país (el agente crea por tandas), un solo aviso
-- con el total de la tanda. Se apaga en Mis alertas (alerta_config 'guias'). Las guías anuladas no cuentan.

insert into public.alerta_config (clave, nombre, detalle, params) values
  ('guias', 'Venta con guía', 'Al instante, cada guía nueva en Effi con la bandera, el valor y el total del día. Más de 5 en un minuto de un país: un solo aviso con el total.', '{}')
on conflict (clave) do nothing;

create or replace function public.alerta_guias() returns int
language plpgsql security definer set search_path = '' set "TimeZone" to 'UTC' as $$
declare
  c record; e record; n int := 0; hoy record;
begin
  if not exists (select 1 from public.alerta_config where clave = 'guias' and activa) then return 0; end if;
  create temp table if not exists _gui (cuenta text, empresa bigint, sucursal bigint, id bigint, ref text) on commit drop;
  truncate _gui;
  insert into _gui
  select g.cuenta, g.empresa, g.sucursal, g.id, g.cuenta || ':' || g.empresa || ':' || g.sucursal || ':' || g.id
  from public.effi_accounts a
  join public.effi_guias g on g.cuenta = a.slug and g.fecha_trans > now() - interval '24 hours'
  where a.tipo = 'tienda' and a.activa and g.vigente is not false and g.fecha_anular is null
    and not exists (select 1 from public.alerta_enviada x where x.clave = 'guias'
                    and x.ref = g.cuenta || ':' || g.empresa || ':' || g.sucursal || ':' || g.id);
  if not exists (select 1 from _gui) then return 0; end if;
  insert into public.alerta_enviada (clave, ref) select 'guias', ref from _gui on conflict do nothing;

  for c in
    select x.cuenta, a.pais, a.sociedad, a.tz_offset_min, count(*) as cant,
      sum(case when g.recaudo then coalesce(g.valor_recaudo, 0) else 0 end) as total
    from _gui x join public.effi_accounts a on a.slug = x.cuenta
    join public.effi_guias g on g.cuenta = x.cuenta and g.empresa = x.empresa and g.sucursal = x.sucursal and g.id = x.id
    group by 1, 2, 3, 4
  loop
    -- Lo del día (día del país): guías creadas hoy y su valor contra entrega.
    select count(*) as cant, coalesce(sum(g.valor_recaudo) filter (where g.recaudo), 0) as total
    into hoy
    from public.effi_guias g
    where g.cuenta = c.cuenta and g.vigente is not false and g.fecha_anular is null
      and g.fecha_trans >= (((now() + make_interval(mins => c.tz_offset_min))::date)::timestamp - make_interval(mins => c.tz_offset_min));

    if c.cant <= 5 then
      for e in
        select g.valor_recaudo, g.recaudo, g.nombre_ciudad_destinatario as ciudad, g.nombre_transportadora_efficommerce as transp
        from _gui x join public.effi_guias g on g.cuenta = x.cuenta and g.empresa = x.empresa and g.sucursal = x.sucursal and g.id = x.id
        where x.cuenta = c.cuenta
      loop
        n := n + public.push_encolar('guia',
          public.alerta_bandera(c.pais) || ' ' || case when c.sociedad <> 'Joalix AA Group' then c.sociedad || ' · ' else '' end ||
            'Venta con guía · ' || case when e.recaudo is false then 'pago anticipado' else public.alerta_plata(c.pais, e.valor_recaudo) end,
          concat_ws(' · ', initcap(lower(e.ciudad)), e.transp) || E'\nHoy: ' || hoy.cant || ' guías · ' || public.alerta_plata(c.pais, hoy.total),
          '/datos?c=' || c.cuenta);
      end loop;
    else
      n := n + public.push_encolar('guia',
        public.alerta_bandera(c.pais) || ' ' || case when c.sociedad <> 'Joalix AA Group' then c.sociedad || ' · ' else '' end ||
          c.cant || ' ventas con guía · ' || public.alerta_plata(c.pais, c.total),
        'Hoy: ' || hoy.cant || ' guías · ' || public.alerta_plata(c.pais, hoy.total),
        '/datos?c=' || c.cuenta);
    end if;
  end loop;
  if n > 0 then perform public.push_despachar(); end if;
  return n;
end $$;
revoke all on function public.alerta_guias() from public, anon, authenticated;

-- Al encender: las guías de las últimas 24 h cuentan como avisadas (no llega una avalancha).
insert into public.alerta_enviada (clave, ref)
select 'guias', g.cuenta || ':' || g.empresa || ':' || g.sucursal || ':' || g.id
from public.effi_guias g where g.fecha_trans > now() - interval '24 hours'
on conflict do nothing;

select cron.schedule('alerta-guias', '* * * * *', $c$ select public.alerta_guias(); $c$);
