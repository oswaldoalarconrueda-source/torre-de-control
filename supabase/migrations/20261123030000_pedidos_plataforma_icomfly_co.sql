-- Pedidos plataformas, Joalix Colombia (pedido del dueño, 23-nov-2026): desde noviembre Colombia lleva dos casillas por día,
-- los pedidos de Lucid (a mano, como siempre, en app_pedidos_diarios) y los de icomfly (pedidos de Shopify, automáticos desde
-- el 22-nov) en app_pedidos_plataforma. El correo de CPA sigue esperando a que se llene Lucid (informe_cpa_faltan no cambia),
-- pero el CPA, la tasa de despacho y la alerta de despacho cuentan los dos (vista v_pedidos_dia).

create table if not exists public.app_pedidos_plataforma (
  cuenta text not null,
  fecha date not null,
  plataforma text not null,
  pedidos integer not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, fecha, plataforma)
);
alter table public.app_pedidos_plataforma enable row level security;
create policy app_pedidos_plataforma_dueno on public.app_pedidos_plataforma for all to authenticated
  using ((select public.app_es_owner())) with check ((select public.app_es_owner()));
create policy app_pedidos_plataforma_leer on public.app_pedidos_plataforma for select to authenticated
  using (cuenta = any ((select public.app_cuentas_visibles())::text[]));

-- Pedidos del día por tienda: Lucid (a mano) + plataformas automáticas.
create or replace view public.v_pedidos_dia with (security_invoker = true) as
  select cuenta, fecha, sum(pedidos)::integer as pedidos
  from (select cuenta, fecha, pedidos from public.app_pedidos_diarios
        union all
        select cuenta, fecha, pedidos from public.app_pedidos_plataforma) x
  group by cuenta, fecha;
grant select on public.v_pedidos_dia to authenticated;

-- El llenado de cada hora (cron pedidos-icomfly, minuto 45) suma Colombia: pedidos de icomfly por día (hora de Bogotá),
-- desde noviembre, los últimos 7 días.
create or replace function public.pedidos_icomfly_llenar() returns integer
language plpgsql security definer set search_path to 'public' as $function$
declare v_n integer; v_m integer;
begin
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
  select count(*)::int into v_n from ins;

  with i as (
    select cuenta, fecha, count(distinct id)::int n from icomfly_pedidos
    where cuenta = 'TIENDA_CO' and fecha >= greatest(date '2026-11-01', (now() at time zone 'America/Bogota')::date - 7)
    group by 1, 2),
  ins as (
    insert into app_pedidos_plataforma (cuenta, fecha, plataforma, pedidos, actualizado_en)
    select cuenta, fecha, 'icomfly', n, now() from i
    on conflict (cuenta, fecha, plataforma) do update set pedidos = excluded.pedidos, actualizado_en = excluded.actualizado_en
      where app_pedidos_plataforma.pedidos is distinct from excluded.pedidos
    returning 1)
  select count(*)::int into v_m from ins;
  return v_n + v_m;
end $function$;

-- CPA, tasa de despacho y alerta de despacho: Lucid + plataformas.
do $do$
declare f text; d text; v text;
begin
  foreach f in array array['public.informe_cpa(date,text)', 'public.tasa_despacho_dia(text,date)', 'public.tasa_despacho_diaria(text[],date,date)', 'public.alerta_despacho()'] loop
    d := pg_get_functiondef(f::regprocedure);
    v := d;
    d := replace(d, 'public.app_pedidos_diarios p ', 'public.v_pedidos_dia p ');
    if d = v then raise exception '% no usa app_pedidos_diarios p', f; end if;
    execute d;
  end loop;
end $do$;

select public.pedidos_icomfly_llenar();
