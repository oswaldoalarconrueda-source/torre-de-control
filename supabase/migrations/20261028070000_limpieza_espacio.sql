-- Limpieza de espacio (pedido del dueño, 28-oct): la base pesaba 535 MB y el plan gratis da 500 MB.
-- Solo se quita lo que no afecta la operación:
-- 1. Bitácoras técnicas: corridas de la sincronización (effi_sync_runs) y de las tareas programadas
--    (cron.job_run_details). Se dejan los últimos 3 días y se limpian solas cada día.
-- 2. Avisos de webhooks (effi_webhook_events) ya aplicados, con más de 3 días: lo que traían ya está en las tablas de la
--    Torre desde que llegaron. Los que quedaron con error se guardan 15 días para poder revisarlos.
-- 3. Índices que no se usaron ni una vez desde el 23-oct (no guardan datos; si alguna pantalla los necesita se crean
--    de nuevo en minutos).

create or replace function public.limpieza_diaria()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a int; b int; c int;
begin
  delete from public.effi_sync_runs where inicio < now() - interval '3 days';
  get diagnostics a = row_count;
  delete from cron.job_run_details where start_time < now() - interval '3 days';
  get diagnostics b = row_count;
  delete from public.effi_webhook_events
  where (procesado_en is not null and recibido_en < now() - interval '3 days')
     or recibido_en < now() - interval '15 days';
  get diagnostics c = row_count;
  return jsonb_build_object('sync_runs', a, 'cron', b, 'avisos', c);
end $$;
revoke all on function public.limpieza_diaria() from public, anon, authenticated;

select cron.unschedule('limpieza-diaria') where exists (select 1 from cron.job where jobname = 'limpieza-diaria');
select cron.schedule('limpieza-diaria', '30 8 * * *', $$ select public.limpieza_diaria(); $$);  -- 3:30 a. m. Colombia

select public.limpieza_diaria();

drop index if exists public.effi_guia_estados_estado_fecha;
drop index if exists public.effi_guias_drop;
drop index if exists public.effi_guias_fecha_trans;
drop index if exists public.effi_guias_abiertas;
drop index if exists public.prov_remisiones_drop;
drop index if exists public.effi_novedades_t2;
drop index if exists public.effi_novedades_cuenta_fecha_trans_desc;
drop index if exists public.effi_novedades_cuenta_guia;
drop index if exists public.effi_novedades_cuenta_est_novedad;
-- Después, a mano (no corre dentro de una migración): vacuum full public.effi_sync_runs; vacuum full cron.job_run_details;
