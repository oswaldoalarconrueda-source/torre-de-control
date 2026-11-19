-- Dropi por MCP para Joalix Guatemala y Colombia, 19-nov-2026: Dropi no dice de qué tienda es cada orden, así que antes de guardar
-- se compara lo que trae el permiso con lo que ya hay en la base. Si las órdenes son de otra tienda, no se guarda nada.
-- Una tienda recién autorizada queda en prueba (sincroniza = false): la función solo compara hasta que se revise y se active.

alter table public.dropi_conexion add column if not exists sincroniza boolean not null default false;
update public.dropi_conexion set sincroniza = true where cuenta = 'AUNCLIC_GT';

-- Solo lectura: cuántas órdenes coinciden, cuáles son nuevas, qué estados cambiarían. Devuelve conteos, nunca datos de clientes.
create or replace function public.dropi_comparar_mcp(p_cuenta text, p_filas jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  with f as (
    select distinct on (r.id) r.id, r.fecha, r.estatus, r.venta
    from jsonb_to_recordset(p_filas) as r(id bigint, fecha date, estatus text, venta numeric)
    order by r.id
  ),
  propias as (
    select f.id, f.estatus as nuevo, f.venta as venta_nueva, o.estatus as actual, o.venta as venta_actual
    from f join public.dropi_ordenes o on o.cuenta = p_cuenta and o.id = f.id
  ),
  ajenas as (
    select o.cuenta, count(*) as n from f join public.dropi_ordenes o on o.id = f.id and o.cuenta <> p_cuenta group by 1
  ),
  nuevas as (
    select f.* from f where not exists (select 1 from propias p where p.id = f.id)
  ),
  c as (
    select
      (select count(*) from f) as recibidas,
      (select count(*) from propias) as propias,
      (select count(*) from nuevas) as nuevas,
      (select coalesce(sum(n), 0) from ajenas) as ajenas,
      (select count(*) from public.dropi_ordenes o where o.cuenta = p_cuenta and o.fecha >= date '2026-08-01') as en_base
  )
  select jsonb_build_object(
    'activa', coalesce((select x.sincroniza from public.dropi_conexion x where x.cuenta = p_cuenta), false),
    'pasa', c.ajenas * 10 <= c.recibidas and (c.en_base = 0 or c.propias * 2 >= c.en_base),
    'recibidas', c.recibidas, 'propias', c.propias, 'nuevas', c.nuevas, 'en_base', c.en_base,
    'ajenas', coalesce((select jsonb_object_agg(a.cuenta, a.n) from ajenas a), '{}'::jsonb),
    'en_base_sin_ver', (select count(*) from public.dropi_ordenes o where o.cuenta = p_cuenta and o.fecha >= date '2026-08-01'
                        and not exists (select 1 from f where f.id = o.id)),
    'rango', jsonb_build_object('desde', (select min(fecha) from f), 'hasta', (select max(fecha) from f)),
    'nuevas_por_mes', coalesce((select jsonb_object_agg(m.mes, jsonb_build_object('ordenes', m.n, 'venta', m.v))
                                from (select to_char(fecha, 'YYYY-MM') as mes, count(*) as n, round(sum(venta)) as v from nuevas group by 1) m), '{}'::jsonb),
    'cambios_estado', coalesce((select jsonb_agg(jsonb_build_object('de', x.actual, 'a', x.nuevo, 'n', x.n) order by x.n desc)
                                from (select actual, nuevo, count(*) as n from propias where actual is distinct from nuevo group by 1, 2) x), '[]'::jsonb),
    'venta_distinta', (select count(*) from propias where venta_actual is distinct from venta_nueva)
  ) from c;
$$;
revoke all on function public.dropi_comparar_mcp(text, jsonb) from public, anon, authenticated;
grant execute on function public.dropi_comparar_mcp(text, jsonb) to service_role;
