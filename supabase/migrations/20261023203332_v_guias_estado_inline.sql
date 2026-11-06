-- El estado unificado va como CASE dentro de la vista (una función con SET no se puede "inline" y cuesta por fila).
drop view public.v_guias;
create view public.v_guias with (security_invoker = true) as
select
  g.*,
  a.pais, a.nombre as nombre_cuenta,
  (g.fecha_trans + make_interval(mins => a.tz_offset_min))::date as fecha_local,
  case
    when g.fecha_recaudo is not null then 'ENTREGADO'  -- el wallet manda
    when g.est_guia_efficommerce = 4 then 'ENTREGADO'
    when g.est_guia_efficommerce = 5 then 'DEVOLUCION'
    when g.est_guia_efficommerce in (2, 8) then 'EN_TRANSITO'
    when g.est_guia_efficommerce = 3 then 'NOVEDAD'
    when g.est_guia_efficommerce = 9 then 'EN_OFICINA'
    when g.est_guia_efficommerce = 6 then 'INDEMNIZACION'
    when g.est_guia_efficommerce = 7 then 'EXCLUIDA'
    else 'PENDIENTE'
  end as estado_u,
  (g.fecha_anular is not null or g.vigente is false) as anulada,
  coalesce(g.nombre_destinatario like '*%', false) as recuperado
from public.effi_guias g
join public.effi_accounts a on a.slug = g.cuenta;
revoke all on public.v_guias from anon;
grant select on public.v_guias to authenticated;
