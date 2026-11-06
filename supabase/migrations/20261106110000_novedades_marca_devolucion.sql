-- Bandeja de novedades (pedido del dueño, 5-nov): cada fila dice si la guía ya va de regreso ("Devolución en Tránsito"),
-- para que la asesora lo vea de un vistazo; la columna Guía muestra el estado de la novedad, no el de la devolución.
do $do$
declare
  d text := pg_get_functiondef('public.novedades_bandeja(text[])'::regprocedure);
  v text := d;
begin
  d := replace(d, $x$'recaudo', n.valor_recaudo, $x$,
    $x$'recaudo', n.valor_recaudo, 'devolucion', case when g.estado_efficommerce = 'Devolución a origen' then coalesce(nullif(g.estado, ''), 'Devolución') end, $x$);
  if d = v then raise exception 'novedades_bandeja: no se encontró dónde agregar la devolución'; end if;
  execute d;
end $do$;
