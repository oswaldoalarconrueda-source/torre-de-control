-- drop_conciliar más robusto: al subir los archivos por primera vez falló desde la pantalla (sin estadísticas de las
-- filas recién cargadas, el plan se volvía lento y la API corta a los 8 s). Ahora analiza antes de cruzar, indexa sus
-- tablas temporales y usa not exists. Mismo resultado.
create or replace function public.drop_conciliar(p_cuenta text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_res jsonb;
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño puede conciliar'; end if;
  -- Recién cargado no hay estadísticas de esas filas y el plan sale lentísimo (la pantalla corta a los 8 s).
  analyze public.dropi_ordenes; analyze public.dropi_cartera; analyze public.icomfly_pedidos;

  drop table if exists pg_temp._ped; drop table if exists pg_temp._ord; drop table if exists pg_temp._map;
  create temp table _ped on commit drop as
    select distinct on (id) id, guia, cliente_hash, total, fecha, departamento, municipio
    from public.icomfly_pedidos where cuenta = p_cuenta order by id, linea;
  create temp table _ord on commit drop as
    select id, guia, cliente_hash, venta, fecha from public.dropi_ordenes where cuenta = p_cuenta and tienda = 'drop';
  create temp table _map (pid text primary key, oid bigint unique, via text) on commit drop;
  create index on _ped (guia); create index on _ped (cliente_hash); create index on _ord (guia); create index on _ord (cliente_hash);
  analyze _ped; analyze _ord;

  insert into _map select distinct on (o.id) p.id, o.id, 'guia'
    from _ped p join _ord o on o.guia = p.guia where p.guia is not null order by o.id, p.fecha desc on conflict do nothing;
  insert into _map select distinct on (o.id) p.id, o.id, 'nombre_monto'
    from _ped p join _ord o on o.cliente_hash = p.cliente_hash and o.venta = p.total
    where p.cliente_hash is not null and not exists (select 1 from _map x where x.pid = p.id) and not exists (select 1 from _map x where x.oid = o.id)
    order by o.id, abs(o.fecha - p.fecha) on conflict do nothing;
  insert into _map select distinct on (o.id) p.id, o.id, 'nombre_fecha'
    from _ped p join _ord o on o.cliente_hash = p.cliente_hash and abs(o.fecha - p.fecha) <= 1
    where p.cliente_hash is not null and not exists (select 1 from _map x where x.pid = p.id) and not exists (select 1 from _map x where x.oid = o.id)
    order by o.id, abs(o.fecha - p.fecha) on conflict do nothing;

  delete from public.dropi_orden_productos where cuenta = p_cuenta and sku like 'icomfly:%';
  insert into public.dropi_orden_productos (cuenta, orden_id, linea, sku, producto, cantidad)
  select p_cuenta, m.oid, row_number() over (partition by m.oid order by l.linea), 'icomfly:' || l.id, l.producto, l.cantidad
  from _map m join public.icomfly_pedidos l on l.cuenta = p_cuenta and l.id = m.pid
  where l.producto is not null;

  update public.dropi_ordenes o set departamento = p.departamento, ciudad = p.municipio
  from _map m join _ped p on p.id = m.pid
  where o.cuenta = p_cuenta and o.id = m.oid;

  analyze _map;
  update public.dropi_ordenes o set costo = case when w.g is null then null else o.venta - w.g end, flete = 0, comision = 0
  from (select o2.id, g.g from public.dropi_ordenes o2
        left join (select c.orden_id, sum(c.valor) as g from public.dropi_cartera c
                   where c.cuenta = p_cuenta and c.concepto = 'ganancia' group by 1) g on g.orden_id = o2.id
        where o2.cuenta = p_cuenta and o2.tienda = 'drop') w
  where o.cuenta = p_cuenta and o.id = w.id;

  select jsonb_build_object(
    'ordenes', (select count(*) from public.v_dropi_ordenes v where v.cuenta = p_cuenta and v.tienda = 'drop' and v.estado_u <> 'EXCLUIDA'),
    'por_estado', (select coalesce(jsonb_object_agg(e, n), '{}'::jsonb) from (select v.estado_u as e, count(*) as n from public.v_dropi_ordenes v
                   where v.cuenta = p_cuenta and v.tienda = 'drop' group by 1) x),
    'entregadas', (select count(*) from public.v_dropi_ordenes v where v.cuenta = p_cuenta and v.tienda = 'drop' and v.estado_u = 'ENTREGADO'),
    'devoluciones', (select count(*) from public.v_dropi_ordenes v where v.cuenta = p_cuenta and v.tienda = 'drop' and v.estado_u = 'DEVOLUCION'),
    'ventas', (select coalesce(round(sum(v.venta), 2), 0) from public.v_dropi_ordenes v where v.cuenta = p_cuenta and v.tienda = 'drop' and v.ganancia_cartera is not null),
    'ganancia', (select coalesce(round(sum(c.valor), 2), 0) from public.dropi_cartera c where c.cuenta = p_cuenta and c.concepto = 'ganancia'),
    'saldo', (select round(c.monto_previo + c.valor, 2) from public.dropi_cartera c where c.cuenta = p_cuenta order by c.fecha desc, c.id desc limit 1),
    'retiros', (select coalesce(jsonb_agg(jsonb_build_object('fecha', c.fecha, 'concepto', c.concepto_retiro, 'monto', -c.valor) order by c.fecha), '[]'::jsonb)
                from public.dropi_cartera c where c.cuenta = p_cuenta and c.concepto = 'retiro'),
    'producto', jsonb_build_object(
      'guia', (select count(*) from _map where via = 'guia'),
      'nombre_monto', (select count(*) from _map where via = 'nombre_monto'),
      'nombre_fecha', (select count(*) from _map where via = 'nombre_fecha'),
      'sin_producto', (select count(*) from public.v_dropi_ordenes v where v.cuenta = p_cuenta and v.tienda = 'drop' and v.estado_u <> 'EXCLUIDA'
                       and not exists (select 1 from _map x where x.oid = v.id)),
      'ejemplos_sin', (select coalesce(jsonb_agg(x.g), '[]'::jsonb) from (select coalesce(v.guia, v.id::text) as g from public.v_dropi_ordenes v
                       where v.cuenta = p_cuenta and v.tienda = 'drop' and v.estado_u <> 'EXCLUIDA' and not exists (select 1 from _map x where x.oid = v.id)
                       order by v.fecha desc limit 5) x)),
    'billetera_sin_orden', (select count(*) from public.dropi_cartera c where c.cuenta = p_cuenta and c.orden_id is not null
                            and not exists (select 1 from public.dropi_ordenes o where o.cuenta = c.cuenta and o.id = c.orden_id))
  ) into v_res;
  return v_res;
end $$;
revoke all on function public.drop_conciliar(text) from public, anon;
grant execute on function public.drop_conciliar(text) to authenticated;

-- Honduras: nombres de icomfly que son el mismo producto.
insert into public.prod_alias (cuenta, patron, producto, prioridad)
select v.* from (values
  ('AUNCLIC_HN', 'HEM HERO', 'Hem Hero Tratamiento para Hemorroides', 40),
  ('AUNCLIC_HN', 'CYPERUS', 'Cyperus Rotundus Oil', 40),
  ('AUNCLIC_HN', 'LLAVE GRIFO', 'Llave Grifo Rotacion 1080° Grados', 40),
  ('AUNCLIC_HN', 'SNAP PROSTATE', 'Snap Prostate Health', 40),
  ('AUNCLIC_HN', 'FLEX-?A MAGNESIO', 'Flex-A Magnesio', 40)
) v(cuenta, patron, producto, prioridad)
where not exists (select 1 from public.prod_alias a where a.cuenta = v.cuenta and a.patron = v.patron);
