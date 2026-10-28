-- Webhooks de Effi como plan A y la API como respaldo (pedido del dueño, 28-oct, cuando Effi empezó a despachar).
--
-- Cada aviso que llega a effi_webhook_events se aplica en el mismo momento a las tablas que llena la sincronización:
-- - guia_transporte.*: la guía completa (effi_guias); en el tracking, además, el cambio de estado en effi_guia_estados
--   marcado fuente = 'webhook'.
-- - movimiento_dinero_effi.*: el movimiento de wallet (effi_wallet).
-- - novedad_guia_transporte.* y gestion_novedad_guia_transporte.*: la novedad (effi_novedades).
-- - orden_v.* y remision_v.*: solo se guardan (el agente lee las órdenes por su lado).
-- Los avisos se tratan como datos de Effi y van por el mismo effi_ingest que la API (mismo limpiado y mapeo).
--
-- El aviso de tracking trae la guía como quedó, no el paso exacto del historial: a veces no dice si cambió la guía
-- inicial o la adicional y a veces se salta un paso. Por eso el historial que llega por aviso es provisional: cuando la
-- API trae el historial oficial de esa guía, borra las filas 'webhook' de ese rango y deja las de Effi.
--
-- Respaldo: la API corre cada 5 minutos mientras lleguen avisos; si no llega ninguno en 15 minutos (o hay una carga
-- histórica pendiente), vuelve a correr cada minuto.

alter table public.effi_guia_estados add column if not exists fuente text not null default 'api';

create or replace function public.effi_webhook_aplicar(p_cuenta text, p_payload jsonb)
returns text language plpgsql security definer set search_path = '' set "TimeZone" to 'UTC' as $$
declare
  d jsonb := p_payload -> 'datos';
  v_ev text := p_payload ->> 'evento';
  f timestamptz;
  ini boolean;
begin
  if d is null or jsonb_typeof(d) <> 'object' then return 'sin datos'; end if;
  if v_ev like 'guia_transporte.%' then
    f := nullif(p_payload ->> 'fecha_evento', '')::timestamp at time zone 'UTC';
    perform public.effi_ingest(p_cuenta, 'guias', jsonb_build_object('data', jsonb_build_array(
      case when v_ev = 'guia_transporte.tracking' and f is not null then d || jsonb_build_object('ultimo_cambio_estado', f) else d end)));
    if v_ev = 'guia_transporte.tracking' and f is not null then
      -- Cambió la adicional si la inicial sigue en el estado anterior y hay guía adicional.
      ini := not (nullif(d ->> 'est_guia_adicional', '') is not null and d ->> 'estado_anterior' = d ->> 'est_guia');
      insert into public.effi_guia_estados (cuenta, empresa, sucursal, id_guia, fecha_hist_est, guia_inicial_adicional,
        est_guia_new, guia, guia_adicional, estado_new, est_guia_new_efficommerce, estado_new_efficommerce,
        transportadora_efficommerce, nombre_transportadora_efficommerce, fuente)
      select p_cuenta, coalesce((d ->> 'empresa')::bigint, a.empresa_id), (d ->> 'sucursal')::int, (d ->> 'id')::bigint, f, ini,
        (case when ini then d ->> 'est_guia' else d ->> 'est_guia_adicional' end)::int,
        nullif(d ->> 'guia', ''), nullif(d ->> 'guia_adicional', ''),
        case when ini then d ->> 'estado' else d ->> 'estado_adicional' end,
        nullif(case when ini then d ->> 'est_guia_efficommerce' else d ->> 'est_guia_adicional_efficommerce' end, '')::int,
        case when ini then d ->> 'estado_efficommerce' else d ->> 'estado_adicional_efficommerce' end,
        nullif(d ->> 'transportadora_efficommerce', '')::int, d ->> 'nombre_transportadora_efficommerce', 'webhook'
      from public.effi_accounts a where a.slug = p_cuenta
        and nullif(case when ini then d ->> 'est_guia' else d ->> 'est_guia_adicional' end, '') is not null
      on conflict do nothing;
    end if;
  elsif v_ev like 'movimiento_dinero_effi.%' then
    perform public.effi_ingest(p_cuenta, 'wallet', jsonb_build_object('data', jsonb_build_array(d)));
  elsif v_ev like 'novedad_guia_transporte.%' or v_ev like 'gestion_novedad_guia_transporte.%' then
    if not (d ? 'guia_novedad' and d ? 'id_novedad') then return 'novedad sin la forma esperada: solo se guardó'; end if;
    perform public.effi_ingest(p_cuenta, 'novedades_1', jsonb_build_object('data', jsonb_build_array(d)));
  end if;
  return null;
end $$;
revoke all on function public.effi_webhook_aplicar(text, jsonb) from public, anon, authenticated;

-- Al llegar el aviso: se aplica de una vez. Un fallo nunca impide guardarlo (queda el error y la API lo cubre).
create or replace function public.effi_webhook_al_llegar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    new.error := public.effi_webhook_aplicar(new.cuenta, new.payload);
    new.procesado_en := now();
  exception when others then
    new.error := left(sqlerrm, 300);
    new.procesado_en := null;
  end;
  return new;
end $$;
drop trigger if exists effi_webhook_al_llegar on public.effi_webhook_events;
create trigger effi_webhook_al_llegar before insert on public.effi_webhook_events
  for each row execute function public.effi_webhook_al_llegar();

-- effi_ingest (historial de la API): antes de guardar el historial oficial de una guía, se borran las filas
-- provisionales que llegaron por aviso en ese mismo rango.
do $$
declare d text := pg_get_functiondef('public.effi_ingest(text,text,jsonb)'::regprocedure);
begin
  if position('fuente = ''webhook''' in d) = 0 then
    d := replace(d, $x$  elsif p_recurso = 'hist' then
$x$, $x$  elsif p_recurso = 'hist' then
    delete from public.effi_guia_estados h
    using (select (r ->> 'id')::bigint id, min((r ->> 'fecha_hist_est')::timestamptz) a, max((r ->> 'fecha_hist_est')::timestamptz) b
           from jsonb_array_elements(v_rows) r group by 1) x
    where h.cuenta = p_cuenta and h.fuente = 'webhook' and h.id_guia = x.id
      and h.fecha_hist_est between x.a - interval '2 minutes' and x.b + interval '2 seconds';
$x$);
    if position('fuente = ''webhook''' in d) = 0 then raise exception 'effi_ingest cambió: no se pudo agregar el reemplazo'; end if;
    execute d;
  end if;
end $$;

-- Respaldo por API: cada 5 minutos mientras los avisos lleguen; cada minuto si llevan 15 minutos sin llegar o si hay
-- una carga histórica pendiente.
create or replace function public.effi_sync_disparar()
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  if extract(minute from now())::int % 5 <> 0
     and exists (select 1 from public.effi_webhook_events where recibido_en > now() - interval '15 minutes')
     and not exists (select 1 from public.effi_sync_jobs where estado = 'pendiente') then
    return null;
  end if;
  return net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/effi-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end $$;
