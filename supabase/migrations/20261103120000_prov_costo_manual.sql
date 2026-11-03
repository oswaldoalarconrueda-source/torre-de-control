-- Comisiones de la proveeduría: el costo manual de cada remisión. La API de remisiones no lo trae: sale del reporte de conceptos
-- de Effi (detalle_remision_v) y la función proveeduria lo guarda aquí. avance_costos: hasta dónde va el historial de costos.
alter table public.prov_remisiones add column if not exists costo_manual numeric;
alter table public.prov_sync add column if not exists avance_costos timestamptz not null default '2026-01-01 00:00:00+00';

-- Solo actualiza remisiones que ya existen: las trae la misma función justo antes.
create or replace function public.prov_guardar_costos(p_cuenta text, p_filas jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.prov_remisiones r set costo_manual = f.costo_manual
  from jsonb_to_recordset(p_filas) as f(sucursal integer, id bigint, costo_manual numeric)
  where r.cuenta = p_cuenta and r.sucursal = f.sucursal and r.id = f.id and r.costo_manual is distinct from f.costo_manual;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.prov_guardar_costos(text, jsonb) from public, anon, authenticated;
grant execute on function public.prov_guardar_costos(text, jsonb) to service_role;
