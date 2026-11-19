-- A un clic Honduras / El Salvador, 19-nov-2026: producto por «orden hermana».
-- Cada pedido de icomfly queda amarrado a una sola orden de Drop. Cuando Drop cancela la primera orden y crea otra días después
-- (o es un reenvío, o un duplicado del mismo día), el producto quedaba en la primera y la que sí se despachó salía sin producto.
-- Regla: una orden sin producto (no cancelada ni rechazada) toma el producto de otra orden del mismo cliente (huella del nombre)
-- que sí lo tiene por icomfly, a 45 días o menos, con el mismo monto o a 7 días o menos. Prefiere: mismo monto, hermana
-- cancelada o rechazada, la más cercana. Las líneas llevan sku 'icomfly:hermana:<pedido>' y se rehacen en cada conciliación.
-- Solo toca productos: venta, costo, flete y ganancia no cambian.

do $do$
declare fn text; f text; g text;
  bloque text := $b$  where l.producto is not null;

  -- Orden hermana: mismo cliente, el pedido de icomfly ya quedó en otra orden de Drop (cancelada, reenvío o duplicado).
  insert into public.dropi_orden_productos (cuenta, orden_id, linea, sku, producto, cantidad)
  select p_cuenta, h.oid, row_number() over (partition by h.oid order by l.linea), 'icomfly:hermana:' || l.id, l.producto, l.cantidad
  from (
    select distinct on (o.id) o.id as oid, m.pid
    from public.dropi_ordenes o
    join public.dropi_ordenes s on s.cuenta = o.cuenta and s.tienda = 'drop' and s.id <> o.id and s.cliente_hash = o.cliente_hash
     and abs(s.fecha - o.fecha) <= 45 and (s.venta = o.venta or abs(s.fecha - o.fecha) <= 7)
    join _map m on m.oid = s.id
    where o.cuenta = p_cuenta and o.tienda = 'drop' and o.cliente_hash is not null
      and coalesce(o.estatus, '') not in ('CANCELADO', 'RECHAZADO')
      and not exists (select 1 from _map x where x.oid = o.id)
      and not exists (select 1 from public.dropi_orden_productos p where p.cuenta = p_cuenta and p.orden_id = o.id)
    order by o.id, (s.venta = o.venta) desc, (s.estatus in ('CANCELADO', 'RECHAZADO')) desc, abs(s.fecha - o.fecha), s.id
  ) h
  join public.icomfly_pedidos l on l.cuenta = p_cuenta and l.id = h.pid
  where l.producto is not null;
$b$;
begin
  foreach fn in array array['public.drop_conciliar(text)', 'public.drop_conciliar_sistema(text)'] loop
    f := pg_get_functiondef(fn::regprocedure);
    if strpos(f, 'icomfly:hermana:') > 0 then continue; end if;
    g := replace(f, E'  where l.producto is not null;\n', bloque);
    if g = f then raise exception 'No se encontró dónde insertar la regla en %', fn; end if;
    -- El conteo «sin producto» también reconoce las que heredaron.
    g := replace(g, 'and not exists (select 1 from _map x where x.oid = v.id)',
      'and not exists (select 1 from _map x where x.oid = v.id) and not exists (select 1 from public.dropi_orden_productos p where p.cuenta = p_cuenta and p.orden_id = v.id)');
    g := replace(g, $r$'nombre_fecha', (select count(*) from _map where via = 'nombre_fecha'),$r$,
      $r$'nombre_fecha', (select count(*) from _map where via = 'nombre_fecha'),
      'hermana', (select count(distinct orden_id) from public.dropi_orden_productos where cuenta = p_cuenta and sku like 'icomfly:hermana:%'),$r$);
    execute g;
  end loop;
end $do$;
