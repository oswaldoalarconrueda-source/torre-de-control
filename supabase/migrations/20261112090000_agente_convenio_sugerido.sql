-- 🤖 Agente: cuando Effi no deja hacer la remisión porque el proveedor del convenio no tiene existencias, sugerir a qué
-- convenio cambiarla (pedido del dueño, 12-nov-2026). La API de Effi no da las existencias de los proveedores de
-- dropshipping, así que "tiene unidades" se deduce de lo que se ve: otro convenio del mismo país remisionó ese artículo en
-- las últimas 48 horas (sin que el proveedor la rechazara) y después no ha tenido rechazos por existencias. Si ningún
-- convenio lo ha despachado, el artículo está agotado en todos. La persona decide; el agente no cambia el convenio solo.
create or replace function public.auto_convenio_sugerido(p_cuenta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ok as (select p_cuenta = any (public.app_cuentas_visibles('automatizacion')) as ok),
  -- Órdenes abiertas que Effi rechazó por existencias: el artículo sale del mensaje ("Dropshipping (2 - DRENAJE …)").
  err as (
    select o.sucursal, o.id, o.plan_en,
      (regexp_match(o.plan_motivo, 'Dropshipping \((\d+) - '))[1]::int as art,
      (regexp_match(o.plan_motivo, 'Dropshipping \(\d+ - ([^)]+)\)'))[1] as art_nombre,
      coalesce(o.plan->'remision'->>'convenio_dropshipping', o.convenio_orden) as conv
    from public.auto_ordenes o
    where o.cuenta = p_cuenta and (select ok from ok) and o.fecha_orden > now() - interval '31 days'
      and o.id_remision is null and o.orden_vigente is not false and o.plan_motivo ilike '%supera las existencias disponibles%'
  ),
  -- Remisiones hechas en las últimas 48 h, por convenio y artículo, con el proveedor de la guía.
  exito as (
    select o.rem_convenio as conv, max(o.rem_convenio_nombre) as nombre, (a->>'id')::int as art, count(*) as n,
      max(o.rem_fecha) as ultima, max(g.nombre_empresa_proveedor) as proveedor
    from public.auto_ordenes o
    cross join lateral jsonb_array_elements(coalesce(o.articulos, '[]'::jsonb)) a
    left join public.effi_guias g on g.cuenta = o.cuenta and g.guia = o.guia
    where o.cuenta = p_cuenta and (select ok from ok) and o.fecha_orden > now() - interval '5 days'
      and o.id_remision is not null and o.rem_vigente is not false and o.rem_fecha > now() - interval '48 hours'
      and o.rem_convenio is not null and coalesce(o.rem_dropshipping, '') not ilike '%rechaz%'
    group by 1, 3
  ),
  -- Último rechazo por existencias de cada convenio y artículo.
  agotado as (select conv, art, max(plan_en) as en from err group by 1, 2)
  select coalesce(jsonb_object_agg(e.sucursal || '-' || e.id, jsonb_build_object(
    'articulo', e.art, 'articulo_nombre', e.art_nombre, 'convenio', e.conv,
    'sugerencias', coalesce((
      select jsonb_agg(jsonb_build_object('convenio', x.conv, 'nombre', x.nombre, 'proveedor', x.proveedor,
        'remisiones', x.n, 'ultima', x.ultima) order by x.ultima desc)
      from exito x
      where x.art = e.art and x.conv is distinct from e.conv
        and not exists (select 1 from agotado a where a.conv = x.conv and a.art = x.art and a.en > x.ultima)), '[]'::jsonb))), '{}'::jsonb)
  from err e where e.art is not null;
$$;
revoke all on function public.auto_convenio_sugerido(text) from public, anon;
grant execute on function public.auto_convenio_sugerido(text) to authenticated;
