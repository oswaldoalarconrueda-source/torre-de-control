-- 💼 Drop y por mayor van aparte (lo pidió el dueño el 10-nov-2026): son cálculos distintos. Drop sale 100 % de Effi y su API; por mayor
-- sale siempre de un Excel ya revisado que se sube en la pestaña «Por mayor». Cada uno se liquida y se paga por separado, con su soporte.

-- Cada pago es de un tipo. Los que ya estaban son de drop.
alter table public.prov_liquidaciones add column if not exists tipo text not null default 'drop';
alter table public.prov_liquidaciones drop constraint if exists prov_liquidaciones_tipo_check;
alter table public.prov_liquidaciones add constraint prov_liquidaciones_tipo_check check (tipo in ('drop', 'mayor'));
alter table public.prov_liquidaciones drop column if exists comision_mayor;

drop function if exists public.prov_liquidacion_registrar(text, date, date, numeric, date, text, text, text);
create or replace function public.prov_liquidacion_registrar(p_cuenta text, p_desde date, p_hasta date, p_monto numeric, p_fecha_pago date, p_nota text,
  p_soporte text, p_soporte_nombre text, p_tipo text default 'drop')
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  t jsonb;
  nuevo bigint;
begin
  if not public.prov_puede_pagar(p_cuenta) then raise exception 'No tienes permiso para registrar pagos de esta empresa'; end if;
  if p_tipo not in ('drop', 'mayor') then raise exception 'Tipo de pago desconocido'; end if;
  if p_soporte is null or split_part(p_soporte, '/', 1) <> p_cuenta then raise exception 'Falta la foto del soporte'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'comisiones-soportes' and o.name = p_soporte) then raise exception 'No se encontró la foto del soporte'; end if;
  if p_tipo = 'drop' then
    t := public.prov_comisiones(p_cuenta, p_desde, p_hasta) -> 'totales';
  else
    -- Por mayor: venta y costo con IVA, como en el Excel; no hay comisión de Effi.
    t := (select jsonb_build_object('remisiones', x ->> 'remisiones', 'total_neto', x ->> 'venta_iva', 'costo', x ->> 'costo_iva', 'iva', 0, 'comision_effi', 0,
      'utilidad', x ->> 'utilidad', 'comision', x ->> 'comision') from (select public.prov_comisiones_mayor(p_cuenta, p_desde, p_hasta) -> 'totales' as x) s);
  end if;
  if coalesce((t ->> 'remisiones')::int, 0) = 0 then raise exception 'Este periodo no tiene remisiones para liquidar'; end if;
  insert into public.prov_liquidaciones (cuenta, tipo, desde, hasta, remisiones, total_neto, costo, iva, comision_effi, utilidad, comision, monto_pagado, fecha_pago, nota, soporte, soporte_nombre, creado_por)
  values (p_cuenta, p_tipo, p_desde, p_hasta, (t ->> 'remisiones')::int, (t ->> 'total_neto')::numeric, (t ->> 'costo')::numeric, (t ->> 'iva')::numeric,
    (t ->> 'comision_effi')::numeric, (t ->> 'utilidad')::numeric, (t ->> 'comision')::numeric, p_monto, p_fecha_pago, nullif(trim(p_nota), ''), p_soporte, p_soporte_nombre, (select auth.uid()))
  returning id into nuevo;
  return nuevo;
end $$;
revoke all on function public.prov_liquidacion_registrar(text, date, date, numeric, date, text, text, text, text) from public, anon;
grant execute on function public.prov_liquidacion_registrar(text, date, date, numeric, date, text, text, text, text) to authenticated;

drop function if exists public.prov_liquidaciones_lista(text);
create or replace function public.prov_liquidaciones_lista(p_cuenta text, p_tipo text default 'drop') returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'desde', l.desde, 'hasta', l.hasta, 'remisiones', l.remisiones, 'utilidad', l.utilidad, 'comision', l.comision,
    'monto_pagado', l.monto_pagado, 'fecha_pago', l.fecha_pago, 'nota', l.nota, 'soporte', l.soporte, 'soporte_nombre', l.soporte_nombre,
    'registro', coalesce(nullif(trim(u.nombre), ''), split_part(u.email, '@', 1)), 'creado_en', l.creado_en, 'anulado_en', l.anulado_en) order by l.desde desc, l.id desc), '[]'::jsonb)
  from public.prov_liquidaciones l
  left join public.app_usuarios u on u.user_id = l.creado_por
  where l.cuenta = p_cuenta and l.tipo = p_tipo and p_cuenta = any (public.app_cuentas_visibles('proveeduria'));
$$;
revoke all on function public.prov_liquidaciones_lista(text, text) from public, anon;
grant execute on function public.prov_liquidaciones_lista(text, text) to authenticated;

-- Excel por mayor, paso 1: revisar. Cada fila trae la remisión, la venta y el costo del Excel y el porcentaje. Se busca la remisión en
-- Effi (la del centro de costos por mayor si el número se repite) y se dice si ya estaba cargada o si ya cae en un pago.
create or replace function public.prov_mayor_revisar(p_cuenta text, p_filas jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  with f as (
    select (x ->> 'id')::bigint as id, (x ->> 'subtotal')::numeric as subtotal, (x ->> 'costo')::numeric as costo, (x ->> 'tasa')::numeric as tasa
    from jsonb_array_elements(p_filas) x
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'subtotal', f.subtotal, 'costo', f.costo, 'tasa', f.tasa,
      'encontrada', r.id is not null, 'sucursal', r.sucursal, 'fecha', (r.fecha_trans + make_interval(mins => a.tz_offset_min))::date, 'cliente', trim(r.cliente),
      'centro', r.nombre_centro_costos, 'anulada', r.vigente is false, 'subtotal_effi', r.subtotal, 'costo_effi', r.costo_manual,
      'cargada', m.id is not null, 'costo_antes', m.costo, 'tasa_antes', m.tasa,
      'pagada', exists (select 1 from public.prov_liquidaciones l where l.cuenta = p_cuenta and l.tipo = 'mayor' and l.anulado_en is null
        and (r.fecha_trans + make_interval(mins => a.tz_offset_min))::date between l.desde and l.hasta))
    order by f.id), '[]'::jsonb)
  from f
  cross join public.effi_accounts a
  left join lateral (
    select x.* from public.prov_remisiones x where x.cuenta = p_cuenta and x.id = f.id
    order by (x.nombre_centro_costos ilike '%mayor%') desc, (x.vigente is not false) desc, x.sucursal limit 1
  ) r on true
  left join public.prov_comisiones_mayor m on m.cuenta = p_cuenta and m.sucursal = r.sucursal and m.id = r.id
  where a.slug = p_cuenta and p_cuenta = any (public.app_cuentas_visibles('proveeduria'));
$$;
revoke all on function public.prov_mayor_revisar(text, jsonb) from public, anon;
grant execute on function public.prov_mayor_revisar(text, jsonb) to authenticated;

-- Paso 2: guardar lo autorizado, tal como viene en el Excel (venta, costo y porcentaje). Solo dueño y socios, como los pagos.
create or replace function public.prov_mayor_guardar(p_cuenta text, p_filas jsonb, p_origen text) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.prov_puede_pagar(p_cuenta) then raise exception 'No tienes permiso para cargar comisiones de esta empresa'; end if;
  insert into public.prov_comisiones_mayor (cuenta, sucursal, id, fecha, subtotal, costo, tasa, origen, nota)
  select p_cuenta, r.sucursal, r.id, (r.fecha_trans + make_interval(mins => a.tz_offset_min))::date, (x ->> 'subtotal')::numeric, (x ->> 'costo')::numeric,
    (x ->> 'tasa')::numeric, left(coalesce(nullif(trim(p_origen), ''), 'Excel'), 200), nullif(trim(x ->> 'nota'), '')
  from jsonb_array_elements(p_filas) x
  join public.effi_accounts a on a.slug = p_cuenta
  join lateral (
    select y.* from public.prov_remisiones y where y.cuenta = p_cuenta and y.id = (x ->> 'id')::bigint
    order by (y.nombre_centro_costos ilike '%mayor%') desc, (y.vigente is not false) desc, y.sucursal limit 1
  ) r on true
  where (x ->> 'subtotal')::numeric > 0 and (x ->> 'costo')::numeric >= 0 and (x ->> 'tasa')::numeric > 0 and (x ->> 'tasa')::numeric <= 1
  on conflict (cuenta, sucursal, id) do update set fecha = excluded.fecha, subtotal = excluded.subtotal, costo = excluded.costo, tasa = excluded.tasa,
    origen = excluded.origen, nota = coalesce(excluded.nota, public.prov_comisiones_mayor.nota), creado_en = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.prov_mayor_guardar(text, jsonb, text) from public, anon;
grant execute on function public.prov_mayor_guardar(text, jsonb, text) to authenticated;

-- Quitar una remisión cargada por error (no toca los pagos ya registrados, que guardan sus totales).
create or replace function public.prov_mayor_quitar(p_cuenta text, p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.prov_puede_pagar(p_cuenta) then raise exception 'No tienes permiso para quitar comisiones de esta empresa'; end if;
  delete from public.prov_comisiones_mayor where cuenta = p_cuenta and id = p_id;
end $$;
revoke all on function public.prov_mayor_quitar(text, bigint) from public, anon;
grant execute on function public.prov_mayor_quitar(text, bigint) to authenticated;

-- La lista de por mayor también dice de qué Excel salió cada remisión.
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
        'venta_iva', m.venta_iva, 'costo_iva', m.costo_iva, 'utilidad', m.utilidad, 'tasa', m.tasa, 'comision', m.comision, 'nota', m.nota, 'origen', m.origen)
        order by m.fecha, m.id) from m), '[]'::jsonb),
    'totales', (select jsonb_build_object('remisiones', count(*), 'venta_iva', coalesce(sum(venta_iva), 0), 'costo_iva', coalesce(sum(costo_iva), 0),
        'utilidad', coalesce(sum(utilidad), 0), 'comision', coalesce(sum(comision), 0)) from m)
  )
  where p_cuenta = any (public.app_cuentas_visibles('proveeduria'));
$$;
