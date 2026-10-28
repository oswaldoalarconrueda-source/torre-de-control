-- Proveeduría (pedido de Distrilatam, 28-oct):
-- 1. Cada remisión guarda su centro de costos: ahí la proveeduría separa por mayor y drop y mapea las tiendas.
--    El historial se vuelve a traer desde el 1 de enero (de a 30 días cada 10 minutos) para llenarlo.
-- 2. Seguimiento comercial "en caliente": cada tienda con sus despachos de las últimas 4 semanas y si dejó de
--    despachar, viene bajando, es nueva o sigue activa. Filtrable por centro de costos.

alter table public.prov_remisiones add column if not exists centro_costos integer, add column if not exists nombre_centro_costos text;
create index if not exists prov_remisiones_cuenta_fecha on public.prov_remisiones (cuenta, fecha_trans desc);
update public.prov_sync set avance = '2026-01-01T06:00:00Z';

create or replace function public.prov_tiendas(p_cuenta text, p_centro integer default null)
returns jsonb language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with a as (
    select slug, tz_offset_min, ((now() + make_interval(mins => tz_offset_min))::date) hoy
    from public.effi_accounts where slug = p_cuenta and tipo = 'proveeduria' and p_cuenta = any (public.app_cuentas_visibles())
  ),
  r as (
    select coalesce(nullif(btrim(p.distribuidor), ''), nullif(btrim(p.cliente), ''), 'Sin nombre') tienda,
      p.transaccion_dropshipping is not null es_drop, p.centro_costos, p.nombre_centro_costos, p.total,
      (a.hoy - (p.fecha_trans + make_interval(mins => a.tz_offset_min))::date) dias
    from public.prov_remisiones p join a on a.slug = p.cuenta
    where p.vigente and p.fecha_trans >= now() - interval '90 days'
  ),
  t as (
    select tienda, bool_or(es_drop) drop_, bool_or(not es_drop) mayor,
      string_agg(distinct nombre_centro_costos, ', ') centros,
      count(*) filter (where dias between 0 and 6) s0, count(*) filter (where dias between 7 and 13) s1,
      count(*) filter (where dias between 14 and 20) s2, count(*) filter (where dias between 21 and 27) s3,
      sum(total) filter (where dias between 0 and 6) v0, sum(total) filter (where dias between 7 and 27) v123,
      min(dias) dias_sin, count(*) n90
    from r where p_centro is null or centro_costos = p_centro
    group by 1
  )
  select jsonb_build_object(
    'hoy', (select hoy from a),
    'centros', coalesce((select jsonb_agg(jsonb_build_object('id', centro_costos, 'nombre', nombre, 'remisiones', n) order by n desc)
                from (select centro_costos, max(nombre_centro_costos) nombre, count(*) n from r where centro_costos is not null group by 1) c), '[]'::jsonb),
    'sin_centro', (select count(*) from r where centro_costos is null),
    'tiendas', coalesce((select jsonb_agg(jsonb_build_object(
        'tienda', tienda, 'tipo', case when drop_ and mayor then 'drop y mayor' when drop_ then 'drop' else 'mayor' end, 'centros', centros,
        'semanas', jsonb_build_array(s0, s1, s2, s3), 'valor_semana', coalesce(v0, 0), 'valor_3_semanas', coalesce(v123, 0),
        'dias_sin', dias_sin, 'n90', n90,
        'estado', case
          when s0 = 0 and s1 + s2 + s3 > 0 then 'dejo'
          when s0 = 0 then 'inactiva'
          when s1 + s2 + s3 = 0 then 'nueva'
          when s0 * 3 < (s1 + s2 + s3) * 0.5 then 'bajando'
          else 'activa' end)
      order by (s0 = 0 and s1 + s2 + s3 > 0) desc, (s1 + s2 + s3) desc, s0 desc) from t), '[]'::jsonb)
  );
$$;
revoke all on function public.prov_tiendas(text, integer) from public, anon;
grant execute on function public.prov_tiendas(text, integer) to authenticated;
