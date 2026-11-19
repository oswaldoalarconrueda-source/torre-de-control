-- Drop + icomfly (18-nov-2026): la API de Drop no trae producto, guía ni cliente, pero icomfly guarda el id interno de cada orden
-- de Drop (drop_order_id = id de getOrders). Con esa llave exacta las órdenes que llegan por API toman guía, transportadora y
-- huella del cliente de icomfly, y drop_conciliar_sistema les cruza el producto como a las del archivo.

alter table public.icomfly_pedidos add column if not exists drop_order_id text;
alter table public.drop_mcp_ordenes add column if not exists drop_id text;
create index if not exists icomfly_pedidos_drop_order on public.icomfly_pedidos (cuenta, drop_order_id) where drop_order_id is not null;
create index if not exists drop_mcp_ordenes_drop_id on public.drop_mcp_ordenes (cuenta, drop_id) where drop_id is not null;

-- icomfly_guardar_pedidos: también guarda drop_order_id.
do $do$
declare f text; g text;
begin
  f := pg_get_functiondef('public.icomfly_guardar_pedidos(text, jsonb)'::regprocedure);
  g := replace(f, 'devuelto_en, fuente, actualizado_en)', 'devuelto_en, fuente, actualizado_en, drop_order_id)');
  g := replace(g, '''api'', now()', '''api'', now(), f->>''drop_order_id''');
  if g = f or position('f->>''drop_order_id''' in g) = 0 then raise exception 'No se pudo ajustar icomfly_guardar_pedidos'; end if;
  execute g;
end $do$;

-- drop_guardar_mcp: también guarda el id interno de Drop.
do $do$
declare f text; g text;
begin
  f := pg_get_functiondef('public.drop_guardar_mcp(text, jsonb)'::regprocedure);
  g := replace(f, 'insert into public.drop_mcp_ordenes as d (cuenta, id, fecha,', 'insert into public.drop_mcp_ordenes as d (cuenta, id, drop_id, fecha,');
  g := replace(g, 'select p_cuenta, r.id, r.fecha, r.hora, r.estado_drop,', 'select p_cuenta, r.id, r.drop_id, r.fecha, r.hora, r.estado_drop,');
  g := replace(g, 'as r(id bigint, fecha date, hora text, estado_drop text,', 'as r(id bigint, drop_id text, fecha date, hora text, estado_drop text,');
  g := replace(g, 'on conflict (cuenta, id) do update set fecha = excluded.fecha, hora = excluded.hora, estado_drop', 'on conflict (cuenta, id) do update set drop_id = coalesce(excluded.drop_id, d.drop_id), fecha = excluded.fecha, hora = excluded.hora, estado_drop');
  if position('r.drop_id' in g) = 0 or position('coalesce(excluded.drop_id' in g) = 0 then raise exception 'No se pudo ajustar drop_guardar_mcp'; end if;
  execute g;
end $do$;

-- Completa guía, transportadora y cliente de las órdenes de Drop con lo que dice icomfly (nunca pisa lo que ya tienen).
create or replace function public.drop_completar_icomfly(p_cuenta text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_cuenta not in ('AUNCLIC_HN', 'AUNCLIC_SV') then raise exception 'Tienda no permitida: %', p_cuenta; end if;
  update public.dropi_ordenes o set
    guia = coalesce(o.guia, i.guia),
    transportadora = coalesce(o.transportadora, i.transportadora),
    cliente_hash = coalesce(o.cliente_hash, i.cliente_hash)
  from public.drop_mcp_ordenes m
  join lateral (select p.guia, p.transportadora, p.cliente_hash from public.icomfly_pedidos p
                where p.cuenta = m.cuenta and p.drop_order_id = m.drop_id order by p.linea limit 1) i on true
  where m.cuenta = p_cuenta and m.drop_id is not null and o.cuenta = m.cuenta and o.id = m.id and o.tienda = 'drop'
    and ((o.guia is null and i.guia is not null) or (o.transportadora is null and i.transportadora is not null) or (o.cliente_hash is null and i.cliente_hash is not null));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.drop_completar_icomfly(text) from public, anon, authenticated;
grant execute on function public.drop_completar_icomfly(text) to service_role;
