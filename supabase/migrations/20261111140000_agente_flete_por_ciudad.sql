-- 🤖 Agente, columna Transportadora (pedido del dueño, 11-nov-2026): al lado del % de entrega va el flete que Effi cobra.
-- Sale de la wallet (effi_mv_guia_wallet) de nuestras guías de los últimos 120 días, por ciudad y transportadora:
--   flete     = promedio de lo cobrado en las entregadas;
--   flete_dev = promedio de lo cobrado en las devoluciones.
-- Se guardan suma y cantidad para poder sacar también el promedio del departamento cuando en la ciudad no hay guías.
alter table public.auto_entrega_ciudad
  add column if not exists flete_suma numeric not null default 0,
  add column if not exists flete_n integer not null default 0,
  add column if not exists flete_dev_suma numeric not null default 0,
  add column if not exists flete_dev_n integer not null default 0;

create or replace function public.auto_entrega_ciudad_recalcular() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.auto_entrega_ciudad;
  insert into public.auto_entrega_ciudad (pais, ciudad_clave, transportadora, nombre, entregadas, devoluciones,
    flete_suma, flete_n, flete_dev_suma, flete_dev_n)
  select a.pais, public.auto_norm(g.nombre_ciudad_destinatario) || '|' || public.auto_norm(g.nombre_provincia_destinatario),
    g.transportadora_efficommerce, max(split_part(coalesce(g.nombre_transportadora_efficommerce, g.nombre_transportadora), '|', 1)),
    count(*) filter (where g.est_guia_efficommerce = 4), count(*) filter (where g.est_guia_efficommerce = 5),
    coalesce(sum(w.flete) filter (where g.est_guia_efficommerce = 4 and w.flete > 0), 0),
    count(*) filter (where g.est_guia_efficommerce = 4 and w.flete > 0),
    coalesce(sum(w.flete_dev) filter (where g.est_guia_efficommerce = 5 and w.flete_dev > 0), 0),
    count(*) filter (where g.est_guia_efficommerce = 5 and w.flete_dev > 0)
  from public.effi_guias g
  join public.effi_accounts a on a.slug = g.cuenta and a.tipo = 'tienda'
  left join public.effi_mv_guia_wallet w on w.cuenta = g.cuenta and w.guia = g.guia
  where g.fecha_trans >= now() - interval '120 days' and g.est_guia_efficommerce in (4, 5)
    and g.transportadora_efficommerce is not null and g.nombre_ciudad_destinatario is not null
  group by 1, 2, 3;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.auto_entrega_ciudad_recalcular() from public, anon, authenticated;
grant execute on function public.auto_entrega_ciudad_recalcular() to service_role;
select public.auto_entrega_ciudad_recalcular();

-- Lo extra de las órdenes abiertas: ahora cada transportadora trae también el flete de la ciudad y el del departamento
-- (todas las transportadoras con guías en el departamento, aunque no hayan ido a esa ciudad).
create or replace function public.auto_ordenes_extra(p_cuenta text, p_dias integer default 3) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ok as (select p_cuenta = any (public.app_cuentas_visibles('automatizacion')) as ok),
  pais as (select pais from public.effi_accounts where slug = p_cuenta),
  o as (
    select x.sucursal, x.id, public.tel8(x.telefono) as tel, public.auto_norm(x.ciudad) || '|' || public.auto_norm(x.provincia) as clave
    from public.auto_ordenes x
    where x.cuenta = p_cuenta and (select ok from ok) and x.fecha_orden >= now() - make_interval(days => greatest(1, least(p_dias, 31)))
      and (x.id_remision is null or x.guia is null)
  ),
  tels as (select distinct tel from o where tel is not null and length(tel) = 8),
  g as (
    select t.tel,
      count(*) filter (where x.est_guia_efficommerce = 4) as entregadas,
      count(*) filter (where x.est_guia_efficommerce = 5) as devoluciones,
      count(*) filter (where x.est_guia_efficommerce not in (4, 5) and x.vigente is not false) as en_curso,
      max(x.fecha_trans) as ultima
    from tels t
    join public.effi_guias x on public.tel8(x.telefonos_destinatario) = t.tel
    join public.effi_accounts a on a.slug = x.cuenta and a.tipo = 'tienda' and a.pais = (select pais from pais)
    group by t.tel
  ),
  h as (
    select t.tel, jsonb_strip_nulls(jsonb_build_object(
      'entregadas', coalesce(g.entregadas, 0) + coalesce(m.entregadas, 0),
      'devoluciones', coalesce(g.devoluciones, 0) + coalesce(m.devoluciones, 0),
      'en_curso', coalesce(g.en_curso, 0), 'ultima', g.ultima,
      'propias', case when g.tel is not null then jsonb_build_object('entregadas', g.entregadas, 'devoluciones', g.devoluciones) end,
      'matriz', case when m.telefono is not null then jsonb_build_object('total', m.total, 'entregadas', m.entregadas, 'devoluciones', m.devoluciones) end)) as huella
    from tels t
    left join g on g.tel = t.tel
    left join public.huella_matriz m on m.pais = (select pais from pais) and m.telefono = t.tel
  ),
  claves as (select distinct clave, split_part(clave, '|', 2) as depto from o),
  dep as (
    select split_part(e.ciudad_clave, '|', 2) as depto, e.transportadora, max(e.nombre) as nombre,
      sum(e.flete_suma) as fs, sum(e.flete_n) as fn, sum(e.flete_dev_suma) as ds, sum(e.flete_dev_n) as dn
    from public.auto_entrega_ciudad e
    where e.pais = (select pais from pais) and split_part(e.ciudad_clave, '|', 2) in (select depto from claves)
    group by 1, 2
  ),
  tr as (
    select c.clave, jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', d.transportadora, 'nombre', coalesce(e.nombre, d.nombre),
      'entregadas', coalesce(e.entregadas, 0), 'devoluciones', coalesce(e.devoluciones, 0),
      'flete', round(e.flete_suma / nullif(e.flete_n, 0), 2), 'flete_n', nullif(e.flete_n, 0),
      'flete_dev', round(e.flete_dev_suma / nullif(e.flete_dev_n, 0), 2), 'flete_dev_n', nullif(e.flete_dev_n, 0),
      'flete_depto', round(d.fs / nullif(d.fn, 0), 2), 'flete_depto_n', nullif(d.fn, 0),
      'flete_dev_depto', round(d.ds / nullif(d.dn, 0), 2)))
      order by coalesce(e.entregadas + e.devoluciones, 0) desc) as lista
    from claves c
    join dep d on d.depto = c.depto
    left join public.auto_entrega_ciudad e on e.pais = (select pais from pais) and e.ciudad_clave = c.clave and e.transportadora = d.transportadora
    group by c.clave
  )
  select coalesce(jsonb_object_agg(o.sucursal || '-' || o.id, jsonb_build_object(
    'huella', (select huella from h where h.tel = o.tel),
    'transportadoras', coalesce((select lista from tr where tr.clave = o.clave), '[]'::jsonb))), '{}'::jsonb)
  from o;
$$;
revoke all on function public.auto_ordenes_extra(text, integer) from public, anon;
grant execute on function public.auto_ordenes_extra(text, integer) to authenticated;
