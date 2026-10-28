-- Alerta cuando los webhooks de Effi dejan de llegar (pedido del dueño, 28-oct).
-- "Caídos" = en los últimos 30 minutos la API vio movimiento de la tienda (3 o más cambios de estado o movimientos de
-- wallet) y no llegó ningún aviso de esa tienda. Así de noche, cuando no pasa nada, no hay falsas alarmas.
-- Cada 5 minutos se revisa: al caerse se abre un incidente y sale un correo urgente; al volver se cierra y sale otro
-- correo. Mientras esté abierto, la Torre muestra un aviso rojo al dueño. Solo se vigilan las tiendas que ya han
-- mandado avisos (las demás no tienen webhooks).

create table if not exists public.effi_webhook_incidentes (
  id bigint generated always as identity primary key,
  cuentas text[] not null,
  desde timestamptz not null default now(),
  resuelto_en timestamptz,
  detalle jsonb
);
alter table public.effi_webhook_incidentes enable row level security;
drop policy if exists ver on public.effi_webhook_incidentes;
create policy ver on public.effi_webhook_incidentes for select to authenticated using (public.app_es_owner());

create or replace function public.effi_webhooks_salud()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'cuenta', c.cuenta, 'ultimo_aviso', c.ultimo, 'avisos_30', c.avisos, 'cambios_api_30', c.cambios,
      'caido', c.cambios >= 3 and c.avisos = 0) order by c.cuenta), '[]'::jsonb)
  from (
    select t.cuenta,
      (select max(recibido_en) from public.effi_webhook_events w where w.cuenta = t.cuenta) ultimo,
      (select count(*) from public.effi_webhook_events w where w.cuenta = t.cuenta and w.recibido_en > now() - interval '35 minutes') avisos,
      (select count(*) from public.effi_guia_estados h where h.cuenta = t.cuenta and h.fuente = 'api'
         and h.fecha_hist_est between now() - interval '35 minutes' and now() - interval '5 minutes')
      + (select count(*) from public.effi_wallet m where m.cuenta = t.cuenta
         and m.fecha_trans between now() - interval '35 minutes' and now() - interval '5 minutes') cambios
    from (select distinct cuenta from public.effi_webhook_events where recibido_en > now() - interval '7 days') t
  ) c;
$$;
revoke all on function public.effi_webhooks_salud() from public, anon;

create or replace function public.effi_webhooks_vigilar()
returns text language plpgsql security definer set search_path = '' as $$
declare
  s jsonb := public.effi_webhooks_salud();
  caidas text[] := array(select x ->> 'cuenta' from jsonb_array_elements(s) x where (x ->> 'caido')::boolean);
  abierto public.effi_webhook_incidentes;
begin
  select * into abierto from public.effi_webhook_incidentes where resuelto_en is null order by id desc limit 1;
  if cardinality(caidas) > 0 and abierto.id is null then
    insert into public.effi_webhook_incidentes (cuentas, detalle) values (caidas, s);
    perform public.informe_programado_enviar('webhooks_alerta');
    return 'caídos: ' || array_to_string(caidas, ', ');
  elsif cardinality(caidas) > 0 then
    update public.effi_webhook_incidentes set cuentas = array(select distinct unnest(cuentas || caidas)), detalle = s where id = abierto.id;
    return 'siguen caídos: ' || array_to_string(caidas, ', ');
  elsif abierto.id is not null then
    update public.effi_webhook_incidentes set resuelto_en = now(), detalle = s where id = abierto.id;
    perform public.informe_programado_enviar('webhooks_alerta');
    return 'volvieron';
  end if;
  return 'bien';
end $$;
revoke all on function public.effi_webhooks_vigilar() from public, anon, authenticated;

-- Lo que el correo necesita: el incidente más reciente y la salud de cada tienda.
create or replace function public.effi_webhooks_alerta()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('incidente', (select to_jsonb(i) - 'detalle' from public.effi_webhook_incidentes i order by id desc limit 1),
                            'salud', public.effi_webhooks_salud());
$$;
revoke all on function public.effi_webhooks_alerta() from public, anon, authenticated;

select cron.unschedule('effi-webhooks-vigilar') where exists (select 1 from cron.job where jobname = 'effi-webhooks-vigilar');
select cron.schedule('effi-webhooks-vigilar', '*/5 * * * *', $$ select public.effi_webhooks_vigilar(); $$);
-- El correo (informe_programado 'webhooks_alerta', tipo 'alerta_webhooks') se configura aparte con los destinatarios.
