-- 💼 Comisión del administrador por las ventas por mayor ya pagadas (lo pidió el dueño el 10-nov-2026). Solo entran las remisiones que
-- vienen en los Excel de liquidación ("Comisiones x Mayor"), con su costo y su porcentaje tal cual: Distri Guatemala 10 % y
-- Distrilab 20 %. Regla de los Excel: utilidad = venta × 1,12 − costo × 1,12; comisión = utilidad × porcentaje.
create table if not exists public.prov_comisiones_mayor (
  cuenta text not null references public.effi_accounts (slug),
  sucursal integer not null,
  id bigint not null,
  fecha date not null,                 -- día de creación de la remisión (hora de la empresa)
  subtotal numeric not null,           -- venta antes de IVA
  costo numeric not null,              -- costo manual que trae el Excel
  tasa numeric not null check (tasa > 0 and tasa <= 1),
  venta_iva numeric generated always as (round(subtotal * 1.12, 2)) stored,
  costo_iva numeric generated always as (round(costo * 1.12, 2)) stored,
  utilidad numeric generated always as ((subtotal - costo) * 1.12) stored,
  comision numeric generated always as ((subtotal - costo) * 1.12 * tasa) stored,
  origen text not null,                -- de qué Excel salió
  nota text,
  creado_en timestamptz not null default now(),
  primary key (cuenta, sucursal, id)
);
alter table public.prov_comisiones_mayor enable row level security;

-- Las 11 remisiones de los dos Excel. La fecha y el subtotal salen de la remisión de Effi; el costo, del Excel.
insert into public.prov_comisiones_mayor (cuenta, sucursal, id, fecha, subtotal, costo, tasa, origen, nota)
select r.cuenta, r.sucursal, r.id, (r.fecha_trans + make_interval(mins => a.tz_offset_min))::date, r.subtotal, v.costo, v.tasa, v.origen, v.nota
from (values
  ('DISTRI_GT', 188625::bigint, 2334.96, 0.10, 'Comisiones x Mayor GT - Septiembre', null),
  ('DISTRI_GT', 189281, 3213, 0.10, 'Comisiones x Mayor GT - Septiembre', null),
  ('DISTRI_GT', 189716, 2118.37, 0.10, 'Comisiones x Mayor GT - Septiembre', null),
  ('DISTRI_GT', 190377, 16856.2, 0.10, 'Comisiones x Mayor GT - Septiembre', 'En Effi tiene costo 0; el costo es el que escribieron en el Excel'),
  ('DISTRI_LAB', 4891, 105540, 0.20, 'Comisiones x Mayor GT - Distrilab - Octubre', null),
  ('DISTRI_LAB', 4892, 21570, 0.20, 'Comisiones x Mayor GT - Distrilab - Octubre', null),
  ('DISTRI_LAB', 6393, 49100, 0.20, 'Comisiones x Mayor GT - Distrilab - Octubre', null),
  ('DISTRI_LAB', 6394, 23916, 0.20, 'Comisiones x Mayor GT - Distrilab - Octubre', null),
  ('DISTRI_LAB', 6430, 29744, 0.20, 'Comisiones x Mayor GT - Distrilab - Octubre', null),
  ('DISTRI_LAB', 6437, 21410, 0.20, 'Comisiones x Mayor GT - Distrilab - Octubre', null),
  ('DISTRI_LAB', 6654, 40800, 0.20, 'Comisiones x Mayor GT - Distrilab - Octubre', null)
) as v(cuenta, id, costo, tasa, origen, nota)
join public.prov_remisiones r on r.cuenta = v.cuenta and r.sucursal = 1 and r.id = v.id
join public.effi_accounts a on a.slug = r.cuenta
on conflict (cuenta, sucursal, id) do nothing;

-- Las remisiones por mayor del periodo (por fecha de creación) con sus totales.
create or replace function public.prov_comisiones_mayor(p_cuenta text, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with m as (
    select m.*, trim(r.cliente) as cliente
    from public.prov_comisiones_mayor m
    left join public.prov_remisiones r on r.cuenta = m.cuenta and r.sucursal = m.sucursal and r.id = m.id
    where m.cuenta = p_cuenta and m.fecha between p_desde and p_hasta
  )
  select jsonb_build_object(
    'filas', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'fecha', m.fecha, 'cliente', m.cliente, 'subtotal', m.subtotal, 'costo', m.costo,
        'venta_iva', m.venta_iva, 'costo_iva', m.costo_iva, 'utilidad', m.utilidad, 'tasa', m.tasa, 'comision', m.comision, 'nota', m.nota)
        order by m.fecha, m.id) from m), '[]'::jsonb),
    'totales', (select jsonb_build_object('remisiones', count(*), 'venta_iva', coalesce(sum(venta_iva), 0), 'costo_iva', coalesce(sum(costo_iva), 0),
        'utilidad', coalesce(sum(utilidad), 0), 'comision', coalesce(sum(comision), 0)) from m)
  )
  where p_cuenta = any (public.app_cuentas_visibles('proveeduria'));
$$;
revoke all on function public.prov_comisiones_mayor(text, date, date) from public, anon;
grant execute on function public.prov_comisiones_mayor(text, date, date) to authenticated;

-- Liquidación: cada pago guarda también la comisión por mayor de ese momento.
alter table public.prov_liquidaciones add column if not exists comision_mayor numeric not null default 0;

create or replace function public.prov_liquidacion_registrar(p_cuenta text, p_desde date, p_hasta date, p_monto numeric, p_fecha_pago date, p_nota text, p_soporte text, p_soporte_nombre text)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  t jsonb;
  m jsonb;
  nuevo bigint;
begin
  if not public.prov_puede_pagar(p_cuenta) then raise exception 'No tienes permiso para registrar pagos de esta empresa'; end if;
  if p_soporte is null or split_part(p_soporte, '/', 1) <> p_cuenta then raise exception 'Falta la foto del soporte'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'comisiones-soportes' and o.name = p_soporte) then raise exception 'No se encontró la foto del soporte'; end if;
  t := public.prov_comisiones(p_cuenta, p_desde, p_hasta) -> 'totales';
  m := public.prov_comisiones_mayor(p_cuenta, p_desde, p_hasta) -> 'totales';
  if coalesce((t ->> 'remisiones')::int, 0) = 0 and coalesce((m ->> 'remisiones')::int, 0) = 0 then raise exception 'Este periodo no tiene remisiones para liquidar'; end if;
  insert into public.prov_liquidaciones (cuenta, desde, hasta, remisiones, total_neto, costo, iva, comision_effi, utilidad, comision, comision_mayor, monto_pagado, fecha_pago, nota, soporte, soporte_nombre, creado_por)
  values (p_cuenta, p_desde, p_hasta, (t ->> 'remisiones')::int, (t ->> 'total_neto')::numeric, (t ->> 'costo')::numeric, (t ->> 'iva')::numeric,
    (t ->> 'comision_effi')::numeric, (t ->> 'utilidad')::numeric, (t ->> 'comision')::numeric, coalesce((m ->> 'comision')::numeric, 0),
    p_monto, p_fecha_pago, nullif(trim(p_nota), ''), p_soporte, p_soporte_nombre, (select auth.uid()))
  returning id into nuevo;
  return nuevo;
end $$;
revoke all on function public.prov_liquidacion_registrar(text, date, date, numeric, date, text, text, text) from public, anon;
grant execute on function public.prov_liquidacion_registrar(text, date, date, numeric, date, text, text, text) to authenticated;

create or replace function public.prov_liquidaciones_lista(p_cuenta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'desde', l.desde, 'hasta', l.hasta, 'remisiones', l.remisiones, 'utilidad', l.utilidad, 'comision', l.comision,
    'comision_mayor', l.comision_mayor, 'monto_pagado', l.monto_pagado, 'fecha_pago', l.fecha_pago, 'nota', l.nota, 'soporte', l.soporte, 'soporte_nombre', l.soporte_nombre,
    'registro', coalesce(nullif(trim(u.nombre), ''), split_part(u.email, '@', 1)), 'creado_en', l.creado_en, 'anulado_en', l.anulado_en) order by l.desde desc, l.id desc), '[]'::jsonb)
  from public.prov_liquidaciones l
  left join public.app_usuarios u on u.user_id = l.creado_por
  where l.cuenta = p_cuenta and p_cuenta = any (public.app_cuentas_visibles('proveeduria'));
$$;
revoke all on function public.prov_liquidaciones_lista(text) from public, anon;
grant execute on function public.prov_liquidaciones_lista(text) to authenticated;
