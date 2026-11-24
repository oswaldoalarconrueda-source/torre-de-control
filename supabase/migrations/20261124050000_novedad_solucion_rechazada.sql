-- Soluciones rechazadas (pedido de una asesora de Joalix, 24-nov-2026): cuando la transportadora rechaza la solución enviada
-- desde el Centro de Control, Effi devuelve la novedad a «Pendiente de solución» (est_novedad 1), pero la bandeja la escondía
-- porque ya tenía un envío. Ahora la bandeja marca 'rechazada' (pendiente en Effi con un envío hecho hace más de 20 minutos,
-- el tiempo que Effi tarda en pasarla a «Pendiente de aprobación») para que vuelva a «Por solucionar» y se pueda reenviar.
do $do$
declare d text := pg_get_functiondef('public.novedades_bandeja(text[])'::regprocedure); v text := d;
begin
  d := replace(d, $a$    'envio', case when n.envio_id is null then null$a$,
    $a$    'rechazada', (n.est_novedad = 1 and n.envio_estado = 'enviada' and n.envio_en < now() - interval '20 minutes'),
    'envio', case when n.envio_id is null then null$a$);
  if d = v then raise exception 'novedades_bandeja: no encontré el envío'; end if;
  execute d;
end $do$;
