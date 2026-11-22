-- Smart Commerce (22-nov-2026), segunda parte: la carga del «Reporte de pedidos» y su wallet.
-- app_cargar('smart_pedidos'): pedidos → dropi_ordenes (tienda 'smart'), producto → dropi_orden_productos y la billetera
-- calculada → dropi_cartera (ganancia del entregado = precio − costo de productos − envío − 4 %; devolución = envío de ida,
-- provisional). Se puede subir el archivo acumulado: los pedidos se actualizan y su billetera calculada se rehace.
-- wallet_en_vivo: la billetera de Smart sale aparte (origen 'smart'), sin mezclarse con la de Dropi.

do $do$
declare d text := pg_get_functiondef('public.app_cargar(text,text,text,jsonb,bigint,jsonb)'::regprocedure); v text := d;
begin
  d := replace(d, $a$if (p_tipo like 'dropi_%' or p_tipo like 'drop_%' or p_tipo like 'icomfly_%')$a$,
                  $a$if (p_tipo like 'dropi_%' or p_tipo like 'drop_%' or p_tipo like 'icomfly_%' or p_tipo like 'smart_%')$a$);
  if d = v then raise exception 'app_cargar: no se encontró la validación de cuenta'; end if;
  v := d;
  d := replace(d, $a$  elsif p_tipo = 'icomfly_pedidos' then$a$, $a$  elsif p_tipo = 'smart_pedidos' then
    insert into public.dropi_ordenes as d (cuenta, id, fecha, hora, guia, estatus, transportadora, ciudad, venta, costo, flete, comision,
      ganancia, ultimo_movimiento, tipo_tienda, tienda, id_orden_tienda, categorias, fecha_guia, recuperado, carga_id)
    select p_cuenta, r.id, r.fecha, r.hora, r.guia, r.estatus, r.transportadora, r.ciudad, r.venta, r.costo, r.flete, r.comision,
      r.venta - r.costo - r.flete - r.comision, r.ultimo_movimiento, 'SMART', 'smart', r.id_smart, r.producto, r.fecha_guia, false, v_carga
    from jsonb_to_recordset(p_filas) as r(id bigint, fecha date, hora text, guia text, estatus text, transportadora text, ciudad text,
      venta numeric, costo numeric, flete numeric, comision numeric, ultimo_movimiento text, id_smart text, producto text, fecha_guia timestamp)
    on conflict (cuenta, id) do update set fecha = excluded.fecha, hora = excluded.hora, guia = excluded.guia, estatus = excluded.estatus,
      transportadora = excluded.transportadora, ciudad = excluded.ciudad, venta = excluded.venta, costo = excluded.costo,
      flete = excluded.flete, comision = excluded.comision, ganancia = excluded.ganancia, ultimo_movimiento = excluded.ultimo_movimiento,
      id_orden_tienda = excluded.id_orden_tienda, categorias = excluded.categorias, fecha_guia = excluded.fecha_guia,
      carga_id = excluded.carga_id, actualizado_en = now();
    delete from public.dropi_orden_productos p using jsonb_to_recordset(p_filas) as r(id bigint) where p.cuenta = p_cuenta and p.orden_id = r.id;
    insert into public.dropi_orden_productos (cuenta, orden_id, linea, sku, producto, cantidad, precio_proveedor, precio_proveedor_total, carga_id)
    select p_cuenta, r.id, 1, r.sku, r.producto, r.cantidad, r.costo / nullif(r.cantidad, 0), r.costo, v_carga
    from jsonb_to_recordset(p_filas) as r(id bigint, sku text, producto text, cantidad numeric, costo numeric);
    delete from public.dropi_cartera c using jsonb_to_recordset(p_filas) as r(id bigint)
    where c.cuenta = p_cuenta and c.orden_id = r.id and c.descripcion like '%(Smart Commerce%';
    insert into public.dropi_cartera (cuenta, id, fecha, tipo, monto, orden_id, guia, descripcion, carga_id)
    select p_cuenta, r.id * 10 + 1, coalesce(r.fecha_guia, r.fecha::timestamp), 'ENTRADA', r.venta - r.costo - r.flete - r.comision, r.id, r.guia,
      'ENTRADA POR GANANCIA EN LA ORDEN (Smart Commerce, calculada con el pedido)', v_carga
    from jsonb_to_recordset(p_filas) as r(id bigint, fecha date, guia text, estatus text, venta numeric, costo numeric, flete numeric, comision numeric, fecha_guia timestamp)
    where r.estatus = 'ENTREGADO'
    union all
    select p_cuenta, r.id * 10 + 2, coalesce(r.fecha_guia, r.fecha::timestamp), 'SALIDA', r.flete, r.id, r.guia,
      'SALIDA DE COBRO DE DEVOLUCION (Smart Commerce, provisional: envío de ida)', v_carga
    from jsonb_to_recordset(p_filas) as r(id bigint, fecha date, guia text, estatus text, flete numeric, fecha_guia timestamp)
    where r.estatus = 'DEVOLUCION';

  elsif p_tipo = 'icomfly_pedidos' then$a$);
  if d = v then raise exception 'app_cargar: no se encontró icomfly_pedidos'; end if;
  execute d;
end $do$;

do $do$
declare d text := pg_get_functiondef('public.wallet_en_vivo(text[])'::regprocedure); v text := d;
begin
  d := replace(d, $a$    where not c.es_drop
  )
  , tdi as ($a$, $a$    where not c.es_drop and coalesce(x.descripcion, '') not like '%(Smart Commerce%'
  )
  , ds as (
    select c.slug, x.id, x.valor, x.concepto, x.orden_id, x.guia,
      (x.fecha - make_interval(mins => c.tz_offset_min)) at time zone 'UTC' as f
    from c join public.dropi_cartera x on x.cuenta = c.slug
    where x.descripcion like '%(Smart Commerce%'
  )
  , tds as (
    select c.*, (select sum(d.valor) from ds d where d.slug = c.slug) as saldo,
      (select count(*) from ds d where d.slug = c.slug) as n,
      (select min(d.f) from ds d where d.slug = c.slug) as desde, (select max(d.f) from ds d where d.slug = c.slug) as ultimo
    from c where exists (select 1 from ds d where d.slug = c.slug)
  )
  , tdi as ($a$);
  if d = v then raise exception 'wallet_en_vivo: no se encontró di'; end if;
  v := d;
  d := replace(d, $a$    from tdi c
  ) y;$a$, $a$    from tdi c
    union all
    select jsonb_build_object(
      'cuenta', c.slug,
      'divisa', c.divisa_cuenta,
      'saldo', coalesce(c.saldo, 0),
      'movimientos_total', c.n,
      'desde', c.desde,
      'ultimo', c.ultimo,
      'origen', 'smart',
      'hoy', (select jsonb_build_object(
          'entradas', coalesce(sum(d.valor) filter (where d.valor > 0), 0),
          'salidas', coalesce(sum(d.valor) filter (where d.valor < 0), 0),
          'neto', coalesce(sum(d.valor), 0),
          'movimientos', count(*),
          'recaudos', count(*) filter (where d.concepto = 'ganancia'),
          'recaudo', coalesce(sum(d.valor) filter (where d.concepto = 'ganancia'), 0))
        from ds d where d.slug = c.slug and d.f >= c.inicio),
      'serie', (select jsonb_agg(coalesce(c.saldo, 0) - coalesce(s.despues, 0) order by k desc)
          from generate_series(0, 24) k
          left join lateral (select sum(d.valor) as despues from ds d where d.slug = c.slug and d.f > now() - make_interval(hours => k)) s on true),
      'recientes', (select coalesce(jsonb_agg(m order by m.fecha desc), '[]'::jsonb) from (
          select d.f as fecha,
            case d.concepto when 'ganancia' then 'Ganancia de pedido entregado' when 'flete_dev' then 'Envío perdido por devolución (provisional)' else 'Otro movimiento' end as tipo,
            null::int as t, d.valor, coalesce(d.guia, 'Pedido ' || d.orden_id) as guia, false as anulado
          from ds d where d.slug = c.slug
          order by d.f desc, d.id desc limit 30) m)
    )
    from tds c
  ) y;$a$);
  if d = v then raise exception 'wallet_en_vivo: no se encontró el final'; end if;
  execute d;
end $do$;

-- (aplicado aparte como «smart_tipo_carga») app_cargas acepta el tipo nuevo.
alter table public.app_cargas drop constraint app_cargas_tipo_check;
alter table public.app_cargas add constraint app_cargas_tipo_check check (tipo = any (array['dropi_ordenes', 'dropi_productos', 'dropi_cartera', 'meta_bm', 'drop_ordenes', 'drop_billetera', 'icomfly_pedidos', 'smart_pedidos']));

-- (aplicado aparte como «smart_flete_dev_promedio») La proyección de devoluciones usa el flete de devolución promedio solo de
-- la plataforma elegida: el envío de ida de Smart (Q34–35) no cambia el promedio de Dropi.
do $do$
declare f text; d text; v text;
begin
  foreach f in array array['public.kpi_pendientes(text,date,date,text)', 'public.kpi_utilidad(text,date,date,text)'] loop
    d := pg_get_functiondef(f::regprocedure);
    v := d;
    d := replace(d, '(select avg(f) from (select -sum(valor) as f from public.dropi_cartera where cuenta = p_cuenta and concepto = ''flete_dev'' group by orden_id) z)',
      '(select avg(f) from (select -sum(c.valor) as f from public.dropi_cartera c left join public.dropi_ordenes o on o.cuenta = c.cuenta and o.id = c.orden_id where c.cuenta = p_cuenta and c.concepto = ''flete_dev'' and public.plataforma_incluye(case when p_plataforma = ''effi'' then ''dropi'' else p_plataforma end, coalesce(o.plataforma, ''dropi'')) group by c.orden_id) z)');
    if d = v then raise exception '% sin el promedio de flete de devolución', f; end if;
    execute d;
  end loop;
end $do$;
