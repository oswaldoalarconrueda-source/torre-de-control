-- Bandeja de novedades: debajo de la guía va el estado de novedad que puso la transportadora ("FALTAN DATOS EN
-- DIRECCION", "ENVIO CON NOVEDAD", "EN NOVEDAD POR BOGOTA"…), no el estado general de Effi ("En reparto").
-- Es el último paso del historial que Effi clasificó como Novedad; si la guía no tiene, queda el estado de siempre.
do $$
declare f text := pg_get_functiondef('public.novedades_bandeja(text[])'::regprocedure); nuevo text;
begin
  nuevo := replace(f, $x$'estado_guia', coalesce(g.estado_efficommerce, n.estado),$x$,
    $x$'estado_guia', coalesce((select h.estado_new from public.effi_guia_estados h
        where h.cuenta = n.cuenta and h.empresa = n.empresa and h.sucursal = n.sucursal_guia and h.id_guia = n.id_guia
          and h.estado_new_efficommerce = 'Novedad' and nullif(h.estado_new, '') is not null
        order by h.fecha_hist_est desc limit 1), g.estado_efficommerce, n.estado),$x$);
  if nuevo = f then raise exception 'novedades_bandeja cambió: no se pudo cambiar el estado de la guía'; end if;
  execute nuevo;
end $$;
