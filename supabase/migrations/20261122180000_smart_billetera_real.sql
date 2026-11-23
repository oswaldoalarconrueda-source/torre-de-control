-- Billetera real de Smart Commerce (A un clic Guatemala, 22-nov-2026): el «Reporte de transacciones» de Smart trae cada
-- liquidación por guía (venta entregada: precio − tarifa COD − pago al proveedor − envío; devolución: −Q26 de envío perdido
-- −Q1,50 de penalización). La billetera real manda: reemplaza la calculada de esa orden. Lo que todavía no se liquida sigue
-- con la calculada, y la devolución provisional pasa a costar Q27,50 (lo que cobra Smart).
alter table public.app_cargas drop constraint app_cargas_tipo_check;
alter table public.app_cargas add constraint app_cargas_tipo_check check (tipo = any (array['dropi_ordenes', 'dropi_productos', 'dropi_cartera', 'meta_bm', 'drop_ordenes', 'drop_billetera', 'icomfly_pedidos', 'smart_pedidos', 'smart_billetera']));

do $do$
declare d text := pg_get_functiondef('public.app_cargar(text,text,text,jsonb,bigint,jsonb)'::regprocedure); v text;
begin
  -- smart_pedidos: la calculada solo para órdenes sin billetera real; la devolución provisional cuesta Q27,50.
  v := d;
  d := replace(d, $a$    where r.estatus = 'ENTREGADO'
    union all$a$, $a$    where r.estatus = 'ENTREGADO'
      and not exists (select 1 from public.dropi_cartera x where x.cuenta = p_cuenta and x.orden_id = r.id and x.descripcion like '%(Smart Commerce, billetera real%')
    union all$a$);
  if d = v then raise exception 'app_cargar: smart entregado'; end if;
  v := d;
  d := replace(d, $a$    select p_cuenta, r.id * 10 + 2, coalesce(r.fecha_guia, r.fecha::timestamp), 'SALIDA', r.flete, r.id, r.guia,
      'SALIDA DE COBRO DE DEVOLUCION (Smart Commerce, provisional: envío de ida)', v_carga
    from jsonb_to_recordset(p_filas) as r(id bigint, fecha date, guia text, estatus text, flete numeric, fecha_guia timestamp)
    where r.estatus = 'DEVOLUCION';$a$, $a$    select p_cuenta, r.id * 10 + 2, coalesce(r.fecha_guia, r.fecha::timestamp), 'SALIDA', 27.50, r.id, r.guia,
      'SALIDA DE COBRO DE DEVOLUCION (Smart Commerce, provisional: Q26 de envío perdido + Q1,50 de penalización)', v_carga
    from jsonb_to_recordset(p_filas) as r(id bigint, fecha date, guia text, estatus text, flete numeric, fecha_guia timestamp)
    where r.estatus = 'DEVOLUCION'
      and not exists (select 1 from public.dropi_cartera x where x.cuenta = p_cuenta and x.orden_id = r.id and x.descripcion like '%(Smart Commerce, billetera real%');$a$);
  if d = v then raise exception 'app_cargar: smart devolución'; end if;
  -- smart_billetera: cada liquidación a dropi_cartera con su orden (por la guía) y se borra la calculada de esa orden.
  v := d;
  d := replace(d, $a$  elsif p_tipo = 'icomfly_pedidos' then$a$, $a$  elsif p_tipo = 'smart_billetera' then
    insert into public.dropi_cartera (cuenta, id, fecha, tipo, monto, orden_id, guia, descripcion, carga_id)
    select p_cuenta, r.id, r.fecha, r.tipo, r.monto,
      (select o.id from public.dropi_ordenes o where o.cuenta = p_cuenta and o.plataforma = 'smart' and o.guia = r.guia order by o.fecha desc limit 1),
      r.guia, r.descripcion, v_carga
    from jsonb_to_recordset(p_filas) as r(id bigint, fecha timestamp, tipo text, monto numeric, guia text, descripcion text)
    on conflict (cuenta, id) do update set fecha = excluded.fecha, tipo = excluded.tipo, monto = excluded.monto, orden_id = excluded.orden_id,
      guia = excluded.guia, descripcion = excluded.descripcion, carga_id = excluded.carga_id;
    delete from public.dropi_cartera c
    where c.cuenta = p_cuenta and c.descripcion like '%(Smart Commerce, %' and c.descripcion not like '%billetera real%'
      and exists (select 1 from public.dropi_cartera x where x.cuenta = p_cuenta and x.orden_id = c.orden_id and x.descripcion like '%(Smart Commerce, billetera real%');

  elsif p_tipo = 'icomfly_pedidos' then$a$);
  if d = v then raise exception 'app_cargar: icomfly_pedidos'; end if;
  execute d;
end $do$;

-- La provisional ya cargada (envío de ida) pasa a Q27,50.
update public.dropi_cartera set monto = 27.50,
  descripcion = 'SALIDA DE COBRO DE DEVOLUCION (Smart Commerce, provisional: Q26 de envío perdido + Q1,50 de penalización)'
where descripcion = 'SALIDA DE COBRO DE DEVOLUCION (Smart Commerce, provisional: envío de ida)';

-- Wallet en vivo: si hay billetera real de Smart, el saldo sale solo de ella.
do $do$
declare d text := pg_get_functiondef('public.wallet_en_vivo(text[])'::regprocedure); v text := d;
begin
  d := replace(d, $a$    where x.descripcion like '%(Smart Commerce%'
  )$a$, $a$    where x.descripcion like '%(Smart Commerce%'
      and (x.descripcion like '%billetera real%'
           or not exists (select 1 from public.dropi_cartera y where y.cuenta = c.slug and y.descripcion like '%(Smart Commerce, billetera real%'))
  )$a$);
  if d = v then raise exception 'wallet_en_vivo: ds'; end if;
  v := d;
  d := replace(d, $a$      'origen', 'smart',$a$, $a$      'origen', 'smart',
      'real', exists (select 1 from public.dropi_cartera y where y.cuenta = c.slug and y.descripcion like '%(Smart Commerce, billetera real%'),$a$);
  if d = v then raise exception 'wallet_en_vivo: origen'; end if;
  v := d;
  d := replace(d, $a$'Envío perdido por devolución (provisional)'$a$, $a$'Cobro por devolución (envío perdido + penalización)'$a$);
  if d = v then raise exception 'wallet_en_vivo: etiqueta'; end if;
  execute d;
end $do$;
