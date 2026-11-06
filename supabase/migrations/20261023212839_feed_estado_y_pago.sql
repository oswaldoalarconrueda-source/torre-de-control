-- Feed: se agregan el id del estado global (para filtrar) y si la guía ya tiene recaudo en el wallet.
create or replace view public.v_feed_estados with (security_invoker = true) as
select e.cuenta, e.guia, e.fecha_hist_est, e.estado_new, e.estado_new_efficommerce, e.nombre_transportadora_efficommerce,
  g.nombre_ciudad_destinatario, g.nombre_provincia_destinatario, g.valor_recaudo, g.divisa, g.contenido,
  e.est_guia_new_efficommerce, (g.fecha_recaudo is not null) as pagada
from public.effi_guia_estados e
left join public.effi_guias g on g.cuenta = e.cuenta and g.empresa = e.empresa and g.sucursal = e.sucursal and g.id = e.id_guia;
revoke all on public.v_feed_estados from anon;
grant select on public.v_feed_estados to authenticated;
