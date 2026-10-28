-- Webhooks: un aviso de tracking sin estado_anterior dejaba guia_inicial_adicional en null y fallaba (GT, 28-oct).
-- Sin estado anterior se toma como cambio de la guía inicial.
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
      ini := not coalesce(nullif(d ->> 'est_guia_adicional', '') is not null and d ->> 'estado_anterior' = d ->> 'est_guia', false);
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

-- Se reaplican los avisos que quedaron con ese error.
update public.effi_webhook_events e set error = public.effi_webhook_aplicar(e.cuenta, e.payload), procesado_en = now()
where e.procesado_en is null and e.error like 'null value in column "guia_inicial_adicional"%';
