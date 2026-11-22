-- Smart Commerce (A un clic, 22-nov-2026): tercera plataforma de A un clic Guatemala, además de Effi y Dropi.
-- Sus pedidos se cargan por archivo («Reporte de pedidos» de Smart, tipo smart_pedidos) en las mismas tablas de Dropi
-- (dropi_ordenes con tienda = 'smart', dropi_orden_productos y dropi_cartera), igual que Drop para Honduras y El Salvador.
-- La columna plataforma separa dropi / drop / smart para el selector de Data Experience (Ambas · Effi · Dropi · Smart).
-- Reglas mientras el dueño no diga otra cosa: «Retirado» = el cliente retiró en agencia (entregado); en una devolución
-- se pierde el envío de ida (provisional). La wallet de Smart se calcula con los pedidos (no hay reporte de billetera).

-- 1. Plataforma de cada orden.
alter table public.dropi_ordenes add column if not exists plataforma text
  generated always as (case when tienda = 'smart' then 'smart' when tienda = 'drop' then 'drop' else 'dropi' end) stored;

create or replace view public.v_dropi_ordenes with (security_invoker = on) as
 SELECT o.cuenta, o.id, o.fecha, o.hora, o.guia, o.estatus, o.tipo_envio, o.departamento, o.ciudad, o.transportadora, o.venta,
    o.ganancia, o.flete, o.flete_dev, o.comision, o.costo, o.novedad, o.novedad_solucionada, o.ultimo_movimiento,
    o.fecha_ultimo_movimiento, o.tipo_tienda, o.tienda, o.id_orden_tienda, o.fecha_guia, o.recuperado, o.categorias,
    o.fecha_cancelacion, o.cancelado_por, o.motivo_cancelacion, o.fecha_reporte, o.carga_id, o.actualizado_en,
    w.ganancia AS ganancia_cartera, w.flete_dev AS flete_dev_cartera, w.otros AS otros_cartera,
        CASE
            WHEN (w.ganancia IS NOT NULL) THEN 'ENTREGADO'::text
            WHEN (w.flete_dev IS NOT NULL) THEN 'DEVOLUCION'::text
            WHEN (o.estatus = 'ENTREGADO'::text) THEN 'ENTREGADO'::text
            WHEN (o.estatus ~~* 'DEVOLUCI%'::text) THEN 'DEVOLUCION'::text
            WHEN (o.estatus = ANY (ARRAY['CANCELADO'::text, 'RECHAZADO'::text])) THEN 'EXCLUIDA'::text
            WHEN (o.estatus ~~* 'RECLAME EN OFICINA%'::text) THEN 'EN_OFICINA'::text
            WHEN ((o.estatus ~~* '%NOVEDAD%'::text) OR (o.estatus ~~* 'INTENTO DE ENTREGA%'::text) OR (o.estatus ~~* 'INCIDENCIA%'::text)) THEN 'NOVEDAD'::text
            WHEN (o.estatus = ANY (ARRAY['PENDIENTE'::text, 'PENDIENTE CONFIRMACION'::text, 'GUIA_GENERADA'::text, 'EN PROCESAMIENTO'::text, 'TELEMERCADEO'::text, 'PREPARADO PARA TRANSPORTADORA'::text])) THEN 'PENDIENTE'::text
            ELSE 'EN_TRANSITO'::text
        END AS estado_u,
    o.plataforma
   FROM (dropi_ordenes o
     LEFT JOIN LATERAL ( SELECT sum(c.valor) FILTER (WHERE (c.concepto = 'ganancia'::text)) AS ganancia,
            (- sum(c.valor) FILTER (WHERE (c.concepto = 'flete_dev'::text))) AS flete_dev,
            sum(c.valor) FILTER (WHERE (c.concepto = ANY (ARRAY['garantia_entrada'::text, 'garantia_salida'::text, 'correccion'::text, 'otro'::text]))) AS otros
           FROM dropi_cartera c
          WHERE ((c.cuenta = o.cuenta) AND (c.orden_id = o.id))) w ON (true));

-- 2. ¿La plataforma elegida incluye esta orden? «dropi» sigue incluyendo Drop (Honduras y El Salvador).
create or replace function public.plataforma_incluye(p text, pl text) returns boolean language sql immutable as $$
  select p = 'ambas' or p = pl or (p = 'dropi' and pl = 'drop')
$$;
-- Nombre en pantalla: en A un clic cada plataforma con su nombre; en Joalix la segunda plataforma es «O.A.».
create or replace function public.plataforma_etiqueta(p_cuenta text, pl text) returns text language sql stable as $$
  select case pl when 'smart' then 'Smart' when 'drop' then 'Drop'
    else case when (select sociedad from public.effi_accounts where slug = p_cuenta) = 'A un clic' then 'Dropi' else 'O.A.' end end
$$;

-- 3. Funciones de Data Experience, Global, despacho y pendientes: el filtro de plataforma mira la columna nueva.
do $do$
declare
  f text; d text; v text;
  cambios text[][] := array[
    ['public.kpi_despacho(text,date,date,text)', 'p_plataforma in (''ambas'', ''dropi'')', 'public.plataforma_incluye(p_plataforma, d.plataforma)'],
    ['public.kpi_global(text[],date,date,text)', 'p_plataforma in (''ambas'', ''dropi'')', 'public.plataforma_incluye(p_plataforma, d.plataforma)'],
    ['public.kpi_global_meses(text[],text,integer)', 'p_plataforma in (''ambas'', ''dropi'')', 'public.plataforma_incluye(p_plataforma, d.plataforma)'],
    ['public.kpi_pendientes(text,date,date,text)', 'p_plataforma in (''ambas'', ''dropi'')', 'public.plataforma_incluye(p_plataforma, d.plataforma)'],
    ['public.kpi_diario_dim(text[],date,date,text[],text[],text[],text)', 'p_plataforma in (''ambas'', ''dropi'')', 'public.plataforma_incluye(p_plataforma, d.plataforma)'],
    ['public.kpi_opciones_dim(text[],date,date,text)', 'p_plataforma in (''ambas'', ''dropi'')', 'public.plataforma_incluye(p_plataforma, d.plataforma)'],
    ['public.kpi_utilidad(text,date,date,text)', 'p_plataforma in (''ambas'', ''dropi'') and fecha between', 'public.plataforma_incluye(p_plataforma, plataforma) and fecha between'],
    ['public.kpi_utilidad(text,date,date,text)', 'where c.cuenta = p_cuenta and (select ok from permitido) and p_plataforma in (''ambas'', ''dropi'')', 'where c.cuenta = p_cuenta and (select ok from permitido) and public.plataforma_incluye(p_plataforma, coalesce(o.plataforma, ''dropi''))'],
    ['public.kpi_diario_dim(text[],date,date,text[],text[],text[],text)', 'case when d.recuperado then ''Recuperado'' else ''O.A.'' end, ''O.A.''', 'case when d.recuperado then ''Recuperado'' else public.plataforma_etiqueta(d.cuenta, d.plataforma) end, public.plataforma_etiqueta(d.cuenta, d.plataforma)'],
    ['public.kpi_opciones_dim(text[],date,date,text)', 'case when d.recuperado then ''Recuperado'' else ''O.A.'' end, ''O.A.''', 'case when d.recuperado then ''Recuperado'' else public.plataforma_etiqueta(d.cuenta, d.plataforma) end, public.plataforma_etiqueta(d.cuenta, d.plataforma)']
  ];
  i int;
begin
  for i in 1 .. array_length(cambios, 1) loop
    f := cambios[i][1];
    d := pg_get_functiondef(f::regprocedure);
    v := d;
    d := replace(d, cambios[i][2], cambios[i][3]);
    if d = v then raise exception '% no tiene «%»', f, cambios[i][2]; end if;
    execute d;
  end loop;
end $do$;
