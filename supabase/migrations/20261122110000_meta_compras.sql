-- Pedido del dueño (22-nov-2026): en Productos, una columna informativa con cuántas ventas registró cada campaña en Meta
-- (compras del píxel, acción «purchase» de los insights). Solo informa: no cambia ningún cálculo.
alter table public.app_publicidad_campanas add column if not exists compras integer;

do $do$
declare d text := pg_get_functiondef('public.meta_guardar'::regproc); v text;
begin
  v := d; d := replace(d, 'campana text, monto_cop numeric)
    left join lateral', 'campana text, monto_cop numeric, compras numeric)
    left join lateral');
  if d = v then raise exception 'meta_guardar: recordset'; end if;
  v := d; d := replace(d, 'sum(r.monto_cop) as monto_cop,
    string_agg', 'sum(r.monto_cop) as monto_cop, sum(r.compras)::int as compras,
    string_agg');
  if d = v then raise exception 'meta_guardar: suma'; end if;
  v := d; d := replace(d, 'insert into public.app_publicidad_campanas (cuenta, fecha, cuenta_ads, campana, monto_cop, carga_id, pais)
  select cuenta, fecha, cuenta_ads, campana, monto_cop, null, pais from pg_temp._meta;', 'insert into public.app_publicidad_campanas (cuenta, fecha, cuenta_ads, campana, monto_cop, carga_id, pais, compras)
  select cuenta, fecha, cuenta_ads, campana, monto_cop, null, pais, compras from pg_temp._meta;');
  if d = v then raise exception 'meta_guardar: insert'; end if;
  execute d;
end $do$;

do $do$
declare d text := pg_get_functiondef('public.productos_datos(text,date,date)'::regprocedure); v text;
begin
  v := d; d := replace(d, 'select c.fecha as d, c.cuenta_ads as b, c.campana, sum(c.monto_cop) as v
    from public.app_publicidad_campanas c', 'select c.fecha as d, c.cuenta_ads as b, c.campana, sum(c.monto_cop) as v, sum(c.compras) as k
    from public.app_publicidad_campanas c');
  if d = v then raise exception 'productos_datos: c'; end if;
  v := d; d := replace(d, 'jsonb_build_array(c.d, c.b, c.campana, round(c.v))', 'jsonb_build_array(c.d, c.b, c.campana, round(c.v), c.k)');
  if d = v then raise exception 'productos_datos: sin'; end if;
  execute d;
end $do$;
