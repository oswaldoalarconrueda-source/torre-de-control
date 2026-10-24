-- Utilidad neta real de la pestaña Datos (como en el Dashboard Joalix):
--   PyG confirmado (wallet de las guías montadas en el periodo) − proyección de pendientes (peor caso)
--   − publicidad (Meta, cobrada en COP y convertida con la TRM promedio del mes)
--   − gastos de aplicaciones, administrativos y operativos (meses completos que toca el rango).
-- Las cifras de publicidad, TRM y gastos se cargan desde el Dashboard Joalix (supabase/seed/joalix_publicidad_gastos.sql).

create table public.app_publicidad_diaria (
  cuenta text not null references public.effi_accounts (slug),
  fecha date not null,
  cuenta_ads text not null,
  monto_cop numeric not null,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, fecha, cuenta_ads)
);
comment on table public.app_publicidad_diaria is 'Gasto real de Meta por día y cuenta publicitaria, siempre en COP (así lo cobra Meta).';

create table public.app_publicidad_mensual (
  cuenta text not null references public.effi_accounts (slug),
  mes date not null check (extract(day from mes) = 1),
  monto numeric not null,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, mes)
);
comment on table public.app_publicidad_mensual is 'Respaldo: total del mes en moneda local, para meses sin dato diario (agosto 2026 hacia atrás).';

create table public.app_trm_mes (
  mes date primary key check (extract(day from mes) = 1),
  usd_cop numeric not null,
  gtq_cop numeric not null,
  estimada boolean not null default false,
  actualizado_en timestamptz not null default now()
);
comment on table public.app_trm_mes is 'TRM promedio del mes (COP por USD y por GTQ) para convertir la publicidad de Meta.';

create table public.app_gastos_mensuales (
  cuenta text not null references public.effi_accounts (slug),
  mes date not null check (extract(day from mes) = 1),
  tipo text not null check (tipo in ('apps', 'admin', 'operativo')),
  concepto text not null,
  monto numeric not null,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, mes, tipo, concepto)
);
comment on table public.app_gastos_mensuales is 'Gastos del mes en moneda local: aplicaciones, administrativos (nómina) y operativos.';

create table public.app_ajustes_pyg (
  cuenta text not null references public.effi_accounts (slug),
  fecha date not null,
  concepto text not null,
  monto numeric not null,
  n integer,
  primary key (cuenta, fecha, concepto)
);
comment on table public.app_ajustes_pyg is 'Líneas fijas del PyG que no vienen del wallet (ej. costo Vitalcom x pagar, Colombia 2–4 sep 2026). fecha = día de la guía.';

-- Lectura: lo de las cuentas que el usuario puede ver. Escritura: solo el dueño.
do $$
declare t text;
begin
  foreach t in array array['app_publicidad_diaria', 'app_publicidad_mensual', 'app_gastos_mensuales', 'app_ajustes_pyg'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (cuenta = any ((select public.app_cuentas_visibles())::text[]))', t || '_leer', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.app_es_owner())) with check ((select public.app_es_owner()))', t || '_dueno', t);
  end loop;
end $$;
alter table public.app_trm_mes enable row level security;
create policy app_trm_mes_leer on public.app_trm_mes for select to authenticated using (true);
create policy app_trm_mes_dueno on public.app_trm_mes for all to authenticated using ((select public.app_es_owner())) with check ((select public.app_es_owner()));

-- El resumen por guía del wallet suma ahora todas las líneas del PyG (no solo costos).
drop materialized view public.effi_mv_guia_wallet;
create materialized view public.effi_mv_guia_wallet as
select
  cuenta,
  guia_inicial as guia,
  -coalesce(sum(valor) filter (where t_movimiento = 13), 0) as costo,
  -coalesce(sum(valor) filter (where t_movimiento in (7, 8)), 0) as flete,
  -coalesce(sum(valor) filter (where t_movimiento = 9), 0) as flete_dev,
  -coalesce(sum(valor) filter (where t_movimiento = 12), 0) as fulfillment,
  -coalesce(sum(valor) filter (where t_movimiento = 15), 0) as x4,
  coalesce(sum(valor) filter (where t_movimiento = 1), 0) as recaudo,
  coalesce(sum(valor) filter (where t_movimiento in (20, 21)), 0) as indemnizacion,
  coalesce(sum(valor) filter (where t_movimiento = 34), 0) as credito_revertido,
  coalesce(sum(valor) filter (where t_movimiento = 35), 0) as debito_revertido,
  coalesce(sum(valor) filter (where t_movimiento not in (1, 7, 8, 9, 12, 13, 15, 20, 21, 34, 35, 17, 18, 31, 36, 40, 41)), 0) as otros
from public.effi_wallet
where vigente is not false and guia_inicial is not null
group by 1, 2;
create unique index effi_mv_guia_wallet_pk on public.effi_mv_guia_wallet (cuenta, guia);
revoke all on public.effi_mv_guia_wallet from public, anon, authenticated;

-- Moneda local de una cuenta a partir de COP (Meta cobra en COP). TRM del mes o, si falta, la del último mes cargado antes.
create function public.app_cop_a_local(p_cuenta text, p_cop numeric, p_mes date) returns numeric
language sql stable set search_path = '' as $$
  select case
    when p_cuenta = 'TIENDA_CO' then p_cop
    when t.mes is null then null
    when p_cuenta = 'TIENDA_GT' then p_cop / t.gtq_cop
    when p_cuenta = 'TIENDA_EC' then p_cop / t.usd_cop
  end
  from (select 1) uno
  left join lateral (
    select * from public.app_trm_mes where mes <= p_mes order by mes desc limit 1
  ) t on true;
$$;

create function public.kpi_utilidad(p_cuenta text, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles()) as ok),
  g as (
    select v.guia, v.estado_u, w.recaudo, w.costo, w.flete, w.flete_dev, w.fulfillment, w.x4,
      w.indemnizacion, w.credito_revertido, w.debito_revertido, w.otros
    from public.v_guias v
    left join public.effi_mv_guia_wallet w on w.cuenta = v.cuenta and w.guia = v.guia
    where v.cuenta = p_cuenta and (select ok from permitido)
      and v.fecha_trans >= p_desde::timestamptz - interval '1 day' and v.fecha_trans < p_hasta::timestamptz + interval '2 days'
      and v.fecha_local between p_desde and p_hasta
  ),
  -- PyG en base caja: movimientos del wallet de las guías montadas en el periodo (sin retiros ni transferencias).
  pyg as (
    select concepto, monto, n, orden from (
      select 'Recaudo de venta' as concepto, sum(recaudo) as monto, count(*) filter (where recaudo <> 0) as n, 1 as orden from g
      union all select 'Costo de mercancía vendida', -sum(costo), count(*) filter (where costo <> 0), 2 from g
      union all select 'Flete de envío', -sum(flete), count(*) filter (where flete <> 0), 3 from g
      union all select 'Flete de devolución', -sum(flete_dev), count(*) filter (where flete_dev <> 0), 4 from g
      union all select 'Fulfillment', -sum(fulfillment), count(*) filter (where fulfillment <> 0), 5 from g
      union all select 'Impuesto 4x1000', -sum(x4), count(*) filter (where x4 <> 0), 6 from g
      union all select 'Entrada por indemnización', sum(indemnizacion), count(*) filter (where indemnizacion <> 0), 7 from g
      union all select 'Crédito revertido', sum(credito_revertido), count(*) filter (where credito_revertido <> 0), 8 from g
      union all select 'Débito revertido', sum(debito_revertido), count(*) filter (where debito_revertido <> 0), 9 from g
      union all select 'Otros movimientos', sum(otros), count(*) filter (where otros <> 0), 10 from g
      union all
      select a.concepto, sum(a.monto), sum(a.n)::bigint, 11 from public.app_ajustes_pyg a
      where a.cuenta = p_cuenta and (select ok from permitido) and a.fecha between p_desde and p_hasta group by a.concepto
    ) x where coalesce(monto, 0) <> 0
  ),
  -- Peor caso: todo lo pendiente termina devuelto y paga el flete de devolución promedio real de la cuenta.
  dev_prom as (
    select avg(flete_dev) as v from public.effi_mv_guia_wallet
    where cuenta = p_cuenta and (select ok from permitido) and flete_dev > 0
  ),
  pendientes as (
    select count(*) as n from public.v_guias v
    where v.cuenta = p_cuenta and (select ok from permitido)
      and v.fecha_trans >= p_desde::timestamptz - interval '1 day' and v.fecha_trans < p_hasta::timestamptz + interval '2 days'
      and v.fecha_local between p_desde and p_hasta
      and not v.anulada and v.estado_u in ('PENDIENTE', 'EN_TRANSITO', 'NOVEDAD', 'EN_OFICINA')
  ),
  -- Publicidad: COP por día convertido mes a mes con su TRM; si el rango no tiene dato diario, el total mensual.
  ads_mes as (
    select date_trunc('month', fecha)::date as mes, sum(monto_cop) as cop, count(distinct fecha) as dias, max(fecha) as ultimo
    from public.app_publicidad_diaria
    where cuenta = p_cuenta and (select ok from permitido) and fecha between p_desde and p_hasta
    group by 1
  ),
  ads_cuentas as (
    select cuenta_ads as nombre, sum(monto_cop) as cop,
      sum(public.app_cop_a_local(p_cuenta, monto_cop, date_trunc('month', fecha)::date)) as monto
    from public.app_publicidad_diaria
    where cuenta = p_cuenta and (select ok from permitido) and fecha between p_desde and p_hasta
    group by 1
  ),
  meses as (
    select generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month')::date as mes
  ),
  ads as (
    select
      case when exists (select 1 from ads_mes) then 'diaria'
           when exists (select 1 from public.app_publicidad_mensual m join meses using (mes) where m.cuenta = p_cuenta) then 'mensual' end as fuente,
      coalesce((select sum(public.app_cop_a_local(p_cuenta, cop, mes)) from ads_mes),
               (select sum(m.monto) from public.app_publicidad_mensual m join meses using (mes) where m.cuenta = p_cuenta and (select ok from permitido))) as monto,
      (select sum(cop) from ads_mes) as cop,
      (select sum(dias) from ads_mes) as dias,
      (select max(ultimo) from ads_mes) as ultimo,
      (select max(fecha) from public.app_publicidad_diaria where cuenta = p_cuenta and (select ok from permitido)) as ultimo_cargado
  ),
  gastos as (
    select tipo, sum(monto) as total,
      jsonb_agg(jsonb_build_object('mes', to_char(mes, 'YYYY-MM'), 'concepto', concepto, 'monto', monto) order by mes, monto desc) as detalle
    from public.app_gastos_mensuales join meses using (mes)
    where cuenta = p_cuenta and (select ok from permitido)
    group by 1
  ),
  r as (
    select
      (select coalesce(sum(monto), 0) from pyg) as pyg_total,
      (select n from pendientes) * coalesce((select v from dev_prom), 0) as proyeccion,
      coalesce((select monto from ads), 0) as publicidad,
      coalesce((select total from gastos where tipo = 'apps'), 0) as apps,
      coalesce((select total from gastos where tipo = 'admin'), 0) as admin,
      coalesce((select total from gastos where tipo = 'operativo'), 0) as operativo
  )
  select jsonb_build_object(
    'pyg', coalesce((select jsonb_agg(jsonb_build_object('concepto', concepto, 'monto', monto, 'n', n) order by orden) from pyg), '[]'::jsonb),
    'pyg_total', r.pyg_total,
    'proyeccion', jsonb_build_object('n', (select n from pendientes), 'flete_dev_prom', (select v from dev_prom), 'total', r.proyeccion),
    'publicidad', (select jsonb_build_object('fuente', fuente, 'total', monto, 'cop', cop, 'dias', dias, 'ultimo', ultimo, 'ultimo_cargado', ultimo_cargado,
                     'cuentas', coalesce((select jsonb_agg(c order by c.cop desc) from ads_cuentas c), '[]'::jsonb)) from ads),
    'gastos', jsonb_build_object(
      'meses', (select jsonb_agg(to_char(mes, 'YYYY-MM')) from meses),
      'apps', jsonb_build_object('total', r.apps, 'detalle', coalesce((select detalle from gastos where tipo = 'apps'), '[]'::jsonb)),
      'admin', jsonb_build_object('total', r.admin, 'detalle', coalesce((select detalle from gastos where tipo = 'admin'), '[]'::jsonb)),
      'operativo', jsonb_build_object('total', r.operativo, 'detalle', coalesce((select detalle from gastos where tipo = 'operativo'), '[]'::jsonb))),
    'utilidad_neta', r.pyg_total - r.proyeccion - r.publicidad - r.apps - r.admin - r.operativo
  )
  from r;
$$;
revoke all on function public.kpi_utilidad(text, date, date) from public, anon;
grant execute on function public.kpi_utilidad(text, date, date) to authenticated, service_role;
