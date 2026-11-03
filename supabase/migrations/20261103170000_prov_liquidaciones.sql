-- Comisiones: las remisiones sin costo manual no se pagan (no entran en neto, costo, Effi, utilidad ni comisión). Liquidación: cada pago
-- al administrador queda en el histórico con los totales de ese momento y la foto del soporte (bucket privado comisiones-soportes).
create or replace function public.prov_comisiones(p_cuenta text, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with tasas as (select 0.12::numeric as iva, 0.01::numeric as effi, 0.10::numeric as comision),
  base as (select * from public.prov_comisiones_base(p_cuenta, p_desde, p_hasta)),
  calc as (
    select b.*, b.costo_manual as costo, b.costo_manual * t.iva as iva, b.total * t.effi as comision_effi,
      b.total - b.costo_manual * (1 + t.iva) - b.total * t.effi as utilidad, t.comision as tasa
    from base b cross join tasas t
    where b.grupo = 'pagada' and coalesce(b.costo_manual, 0) > 0
  ),
  por_cliente as (
    select min(cliente) as cliente, count(*) as remisiones, sum(total) as total_neto, sum(costo) as costo, sum(iva) as iva, sum(costo + iva) as costo_iva,
      sum(comision_effi) as comision_effi, sum(utilidad) as utilidad, sum(utilidad * tasa) as comision
    from calc group by upper(cliente)
  )
  select jsonb_build_object(
    'filas', (select coalesce(jsonb_agg(to_jsonb(p) order by p.remisiones desc, p.total_neto desc), '[]'::jsonb) from por_cliente p),
    'totales', (select jsonb_build_object('remisiones', count(*), 'total_neto', coalesce(sum(total), 0), 'costo', coalesce(sum(costo), 0), 'iva', coalesce(sum(iva), 0),
      'costo_iva', coalesce(sum(costo + iva), 0), 'comision_effi', coalesce(sum(comision_effi), 0), 'utilidad', coalesce(sum(utilidad), 0),
      'comision', coalesce(sum(utilidad * tasa), 0), 'pedidos_cobrados', count(*) filter (where cobrada), 'guias', coalesce(sum(guias), 0)) from calc),
    'estados', (select jsonb_build_object('total', count(*) filter (where grupo <> 'rechazada'), 'pagadas', count(*) filter (where grupo = 'pagada'),
      'devolucion', count(*) filter (where grupo = 'devolucion'), 'transito', count(*) filter (where grupo = 'transito'),
      'entregadas_sin_pago', count(*) filter (where grupo = 'entregada'), 'rechazadas', count(*) filter (where grupo = 'rechazada'),
      'vendido', coalesce(sum(total) filter (where grupo <> 'rechazada'), 0), 'guias', coalesce(sum(guias) filter (where grupo <> 'rechazada'), 0)) from base),
    'sin_costo', (select count(*) from base where grupo = 'pagada' and coalesce(costo_manual, 0) = 0),
    'reversadas', (select count(*) from base where reversada)
  )
  where p_cuenta = any (public.app_cuentas_visibles('proveeduria'));
$$;

-- Registra pagos y anula: el dueño y los socios que ven esa empresa. Quien tenga el módulo solo los ve.
create or replace function public.prov_puede_pagar(p_cuenta text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_cuenta = any (public.app_cuentas_visibles('proveeduria')) and (public.app_es_owner() or exists (
    select 1 from public.app_usuarios u where u.user_id = (select auth.uid()) and u.activo and u.rol = 'socio'));
$$;
revoke all on function public.prov_puede_pagar(text) from public, anon;
grant execute on function public.prov_puede_pagar(text) to authenticated;

create table if not exists public.prov_liquidaciones (
  id bigint generated always as identity primary key,
  cuenta text not null references public.effi_accounts (slug),
  desde date not null,
  hasta date not null,
  remisiones integer not null,
  total_neto numeric not null,
  costo numeric not null,
  iva numeric not null,
  comision_effi numeric not null,
  utilidad numeric not null,
  comision numeric not null,
  monto_pagado numeric not null check (monto_pagado > 0),
  fecha_pago date not null,
  nota text,
  soporte text not null unique,
  soporte_nombre text,
  creado_por uuid references public.app_usuarios (user_id),
  creado_en timestamptz not null default now(),
  anulado_en timestamptz,
  anulado_por uuid references public.app_usuarios (user_id),
  check (desde <= hasta)
);
create index if not exists prov_liquidaciones_cuenta on public.prov_liquidaciones (cuenta, desde desc);
alter table public.prov_liquidaciones enable row level security;

-- Los totales se recalculan aquí: lo guardado es lo que daba la regla en el momento del pago, no lo que mande la pantalla.
create or replace function public.prov_liquidacion_registrar(p_cuenta text, p_desde date, p_hasta date, p_monto numeric, p_fecha_pago date, p_nota text, p_soporte text, p_soporte_nombre text)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  t jsonb;
  nuevo bigint;
begin
  if not public.prov_puede_pagar(p_cuenta) then raise exception 'No tienes permiso para registrar pagos de esta empresa'; end if;
  if p_soporte is null or split_part(p_soporte, '/', 1) <> p_cuenta then raise exception 'Falta la foto del soporte'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'comisiones-soportes' and o.name = p_soporte) then raise exception 'No se encontró la foto del soporte'; end if;
  t := public.prov_comisiones(p_cuenta, p_desde, p_hasta) -> 'totales';
  if coalesce((t ->> 'remisiones')::int, 0) = 0 then raise exception 'Este periodo no tiene remisiones para liquidar'; end if;
  insert into public.prov_liquidaciones (cuenta, desde, hasta, remisiones, total_neto, costo, iva, comision_effi, utilidad, comision, monto_pagado, fecha_pago, nota, soporte, soporte_nombre, creado_por)
  values (p_cuenta, p_desde, p_hasta, (t ->> 'remisiones')::int, (t ->> 'total_neto')::numeric, (t ->> 'costo')::numeric, (t ->> 'iva')::numeric,
    (t ->> 'comision_effi')::numeric, (t ->> 'utilidad')::numeric, (t ->> 'comision')::numeric, p_monto, p_fecha_pago, nullif(trim(p_nota), ''), p_soporte, p_soporte_nombre, (select auth.uid()))
  returning id into nuevo;
  return nuevo;
end $$;
revoke all on function public.prov_liquidacion_registrar(text, date, date, numeric, date, text, text, text) from public, anon;
grant execute on function public.prov_liquidacion_registrar(text, date, date, numeric, date, text, text, text) to authenticated;

-- Anular no borra: el pago y su soporte siguen en el histórico, marcados.
create or replace function public.prov_liquidacion_anular(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  select l.cuenta into c from public.prov_liquidaciones l where l.id = p_id and l.anulado_en is null;
  if c is null or not public.prov_puede_pagar(c) then raise exception 'No se puede anular este pago'; end if;
  update public.prov_liquidaciones set anulado_en = now(), anulado_por = (select auth.uid()) where id = p_id;
end $$;
revoke all on function public.prov_liquidacion_anular(bigint) from public, anon;
grant execute on function public.prov_liquidacion_anular(bigint) to authenticated;

create or replace function public.prov_liquidaciones_lista(p_cuenta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'desde', l.desde, 'hasta', l.hasta, 'remisiones', l.remisiones, 'utilidad', l.utilidad, 'comision', l.comision,
    'monto_pagado', l.monto_pagado, 'fecha_pago', l.fecha_pago, 'nota', l.nota, 'soporte', l.soporte, 'soporte_nombre', l.soporte_nombre,
    'registro', coalesce(nullif(trim(u.nombre), ''), split_part(u.email, '@', 1)), 'creado_en', l.creado_en, 'anulado_en', l.anulado_en) order by l.desde desc, l.id desc), '[]'::jsonb)
  from public.prov_liquidaciones l
  left join public.app_usuarios u on u.user_id = l.creado_por
  where l.cuenta = p_cuenta and p_cuenta = any (public.app_cuentas_visibles('proveeduria'));
$$;
revoke all on function public.prov_liquidaciones_lista(text) from public, anon;
grant execute on function public.prov_liquidaciones_lista(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comisiones-soportes', 'comisiones-soportes', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

-- La carpeta de cada archivo es la empresa: <cuenta>/<archivo>. No hay política de borrar ni cambiar: el soporte queda para siempre.
create policy "soportes de comisiones: ver" on storage.objects for select to authenticated
  using (bucket_id = 'comisiones-soportes' and split_part(name, '/', 1) = any (public.app_cuentas_visibles('proveeduria')));
create policy "soportes de comisiones: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'comisiones-soportes' and public.prov_puede_pagar(split_part(name, '/', 1)));
