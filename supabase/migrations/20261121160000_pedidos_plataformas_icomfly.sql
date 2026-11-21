-- Pedido del dueño (21-nov-2026): en «Pedidos plataformas» de A un clic, Honduras y El Salvador se llenan solos con los
-- pedidos que entran a icomfly (todos los que ingresaron ese día, también los que después se cancelan). Guatemala lo sigue
-- llenando una persona con lo de Lucid.
-- Corre cada hora, después de icomfly-sync (minuto 35): recalcula los últimos 7 días y el de hoy (que sigue abierto).
-- Nunca pisa lo que una persona llenó a mano: solo crea días vacíos o actualiza los que llenó él mismo (fuente icomfly…).

create or replace function public.pedidos_icomfly_llenar()
returns integer language sql security definer set search_path = public as $$
  with dias as (
    select c, d::date f
    from unnest(array['AUNCLIC_HN', 'AUNCLIC_SV']) c,
         generate_series((now() at time zone 'America/Tegucigalpa')::date - 7, (now() at time zone 'America/Tegucigalpa')::date, '1 day') d),
  i as (
    select cuenta, fecha, count(distinct id)::int n from icomfly_pedidos
    where cuenta in ('AUNCLIC_HN', 'AUNCLIC_SV') and fecha >= (now() at time zone 'America/Tegucigalpa')::date - 7
    group by 1, 2),
  ins as (
    insert into app_pedidos_diarios (cuenta, fecha, pedidos, fuente, actualizado_en, actualizado_por)
    select dias.c, dias.f, coalesce(i.n, 0), 'icomfly (automático)', now(), 'icomfly'
    from dias left join i on i.cuenta = dias.c and i.fecha = dias.f
    on conflict (cuenta, fecha) do update set pedidos = excluded.pedidos, fuente = excluded.fuente,
      actualizado_en = excluded.actualizado_en, actualizado_por = excluded.actualizado_por
      where app_pedidos_diarios.fuente like 'icomfly%' and app_pedidos_diarios.pedidos is distinct from excluded.pedidos
    returning 1)
  select count(*)::int from ins
$$;
revoke all on function public.pedidos_icomfly_llenar() from public, anon, authenticated;

-- Lo cargado a mano hoy desde icomfly pasa a ser automático (mismos números).
update public.app_pedidos_diarios set fuente = 'icomfly (automático)', actualizado_por = 'icomfly'
where fuente = 'icomfly (API) · cargado por Claude';

select cron.unschedule('pedidos-icomfly') where exists (select 1 from cron.job where jobname = 'pedidos-icomfly');
select cron.schedule('pedidos-icomfly', '45 * * * *', $$select public.pedidos_icomfly_llenar()$$);
