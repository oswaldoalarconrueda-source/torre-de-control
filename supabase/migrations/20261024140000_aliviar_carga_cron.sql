-- 24-oct-2026 06:45 UTC: la base se quedó sin CPU (resúmenes de 9 s pasaron a >2 min, el sync no alcanzaba a
-- arrancar y las conexiones se caían). Para aliviarla:
--  · los resúmenes precalculados pasan de cada minuto a cada 5 minutos;
--  · la reparación de recaudo sale de ese ciclo y corre sola, una vez por hora.
-- (El sync de Effi sigue cada minuto: los datos crudos llegan igual de rápido.)

create or replace function public.effi_refrescar_resumenes() returns void
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
begin
  refresh materialized view concurrently public.effi_mv_dia;
  refresh materialized view concurrently public.effi_mv_ciudad;
  refresh materialized view concurrently public.effi_mv_dia_dim;
  refresh materialized view concurrently public.effi_mv_guia_wallet;
end $$;

select cron.alter_job(jobid, schedule := '*/5 * * * *') from cron.job where jobname = 'effi-resumenes';
select cron.schedule('effi-reparar-recaudo', '23 * * * *', $$select public.effi_reparar_recaudo();$$);

-- 06:58 UTC: aún así cada refresco tardaba >2 min (la base gratis agotó su presupuesto de disco): se pausa hasta que
-- se recupere. Volver a activarlo con: select cron.alter_job(jobid, active := true) from cron.job where jobname = 'effi-resumenes';
select cron.alter_job(jobid, active := false) from cron.job where jobname = 'effi-resumenes';
