-- Remisiones pagadas sin costo manual: se vuelven a leer de Effi por si ya lo corrigieron. Devuelve los días de la empresa con remisiones
-- por revisar, las que llevan más tiempo sin revisar primero, y cada día espera al menos una hora entre revisiones.
alter table public.prov_remisiones add column if not exists costo_revisado_en timestamptz;

create or replace function public.prov_costos_por_revisar(p_cuenta text, p_limite integer default 3) returns jsonb
language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with cuenta as (
    select a.slug, make_interval(mins => a.tz_offset_min) as off from public.effi_accounts a where a.slug = p_cuenta and a.tipo = 'proveeduria'
  ),
  liq as (
    select w.id_ref, w.sucursal_ref
    from public.effi_wallet w join cuenta c on c.slug = w.cuenta
    where w.t_trans_ref = 4 and w.t_movimiento in (3, 34) and w.vigente is not false
    group by 1, 2
    having bool_or(w.t_movimiento = 3) and not bool_or(w.t_movimiento = 34)
  ),
  dias as (
    select (r.fecha_trans + c.off)::date as dia, min(coalesce(r.costo_revisado_en, 'epoch'::timestamptz)) as revisado
    from public.prov_remisiones r
    join cuenta c on c.slug = r.cuenta
    join liq l on l.id_ref = r.id and l.sucursal_ref = r.sucursal
    where coalesce(r.costo_manual, 0) = 0 and r.transaccion_dropshipping is not null and r.total > 0 and r.vigente is not false
      and r.nombre_centro_costos = 'Principal' and coalesce(r.costo_revisado_en, 'epoch'::timestamptz) < now() - interval '1 hour'
    group by 1
  )
  select coalesce(jsonb_agg(x.dia order by x.revisado, x.dia), '[]'::jsonb)
  from (select d.dia, d.revisado from dias d order by d.revisado, d.dia limit greatest(p_limite, 0)) x;
$$;
revoke all on function public.prov_costos_por_revisar(text, integer) from public, anon, authenticated;
grant execute on function public.prov_costos_por_revisar(text, integer) to service_role;
