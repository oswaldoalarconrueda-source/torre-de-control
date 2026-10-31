-- Aviso de pedidos Lucid (31-oct): el correo del CPA real solo sale cuando están los pedidos de ayer de todas las
-- tiendas. Si a las 7 a. m. (Colombia) todavía faltan, sale un recordatorio a quien los carga con los países que faltan
-- (informe_programado tipo 'cpa_falta', destinatarios por SQL: el repo es público). Una vez al día.
create or replace function public.informe_cpa_recordar()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_dia date := (now() at time zone 'America/Bogota')::date - 1;
  r record; v_faltan text[];
begin
  select * into r from public.informe_programado where tipo = 'cpa_falta' and activo limit 1;
  if not found then return 'sin recordatorio activo'; end if;
  if exists (select 1 from public.informe_programado where tipo = 'cpa' and activo and ultimo_dia >= v_dia) then
    return 'el CPA de ' || v_dia || ' ya salió';
  end if;
  v_faltan := public.informe_cpa_faltan(v_dia, r.sociedad);
  if cardinality(v_faltan) = 0 then return 'no falta nada de ' || v_dia; end if;
  perform public.informe_programado_enviar(r.id);
  return 'aviso enviado: faltan ' || array_to_string(v_faltan, ', ');
end $$;
revoke all on function public.informe_cpa_recordar() from public, anon, authenticated;

-- 7:00 a. m. Colombia = 12:00 UTC.
select cron.unschedule('informe-cpa-recordar') where exists (select 1 from cron.job where jobname = 'informe-cpa-recordar');
select cron.schedule('informe-cpa-recordar', '0 12 * * *', $$select public.informe_cpa_recordar()$$);
