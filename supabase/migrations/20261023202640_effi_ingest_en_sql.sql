-- La función effi-sync reenvía la respuesta cruda de Effi; aquí se limpia, se mapea y se guarda.
-- (Mueve el trabajo de CPU fuera de la Edge Function, que tiene límite de CPU por corrida.)

-- "" y fechas 0000-00-00 → null.
create function public.effi_clean(j jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, case
    when v = '""'::jsonb then 'null'::jsonb
    when jsonb_typeof(v) = 'string' and (v #>> '{}') like '0000-00-00%' then 'null'::jsonb
    else v end), '{}'::jsonb)
  from jsonb_each(j) e(k, v);
$$;

-- Las fechas de Effi vienen en UTC sin zona: se interpretan en UTC.
alter function public.effi_upsert_guias(text, jsonb) set timezone = 'UTC';
alter function public.effi_upsert_guia_estados(text, jsonb) set timezone = 'UTC';
alter function public.effi_upsert_novedades(text, jsonb) set timezone = 'UTC';
alter function public.effi_upsert_wallet(text, jsonb) set timezone = 'UTC';

create function public.effi_ingest(p_cuenta text, p_recurso text, p_payload jsonb) returns int
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_emp bigint;
  v_rows jsonb;
  n int := 0;
begin
  select empresa_id into v_emp from public.effi_accounts where slug = p_cuenta;
  select coalesce(jsonb_agg(public.effi_clean(x)), '[]'::jsonb) into v_rows
  from jsonb_array_elements(coalesce(p_payload -> 'data', '[]'::jsonb)) x;
  if jsonb_array_length(v_rows) = 0 then return 0; end if;

  if v_emp is null and p_recurso = 'guias' then
    v_emp := (v_rows -> 0 ->> 'empresa')::bigint;
    update public.effi_accounts set empresa_id = v_emp where slug = p_cuenta and empresa_id is null;
  end if;

  -- La guía es de empresa+sucursal+id. El historial no trae "empresa": para una tienda es ella
  -- misma; para una proveeduría, el distribuidor dueño de la guía.
  select jsonb_agg(r || jsonb_build_object('empresa', coalesce(r ->> 'empresa', r ->> 'empresa_distribuidor', v_emp::text)))
  into v_rows from jsonb_array_elements(v_rows) r;

  if p_recurso = 'guias' then
    n := public.effi_upsert_guias(p_cuenta, v_rows);
  elsif p_recurso = 'wallet' then
    n := public.effi_upsert_wallet(p_cuenta, v_rows);
  elsif p_recurso like 'novedades%' then
    n := public.effi_upsert_novedades(p_cuenta, v_rows);
  elsif p_recurso = 'hist' then
    n := public.effi_upsert_guia_estados(p_cuenta, (
      select jsonb_agg(jsonb_build_object(
        'empresa', r -> 'empresa',
        'sucursal', r -> 'sucursal',
        'id_guia', r -> 'id',
        'fecha_hist_est', r -> 'fecha_hist_est',
        'guia_inicial_adicional', coalesce(nullif(r -> 'guia_inicial_adicional', 'null'::jsonb), '"1"'::jsonb),
        'est_guia_new', coalesce(nullif(r -> 'est_guia_new', 'null'::jsonb), '-1'::jsonb),
        'guia', r -> 'guia',
        'guia_adicional', r -> 'guia_adicional',
        'estado_new', r -> 'estado_new',
        'est_guia_new_efficommerce', r -> 'est_guia_new_efficommerce',
        'estado_new_efficommerce', r -> 'estado_new_efficommerce',
        'observacion_hist_est', r -> 'observacion_hist_est',
        'responsable_cambio', r -> 'responsable_cambio',
        'transportadora_efficommerce', r -> 'transportadora_efficommerce',
        'nombre_transportadora_efficommerce', r -> 'nombre_transportadora_efficommerce'))
      from jsonb_array_elements(v_rows) r));
    -- Cada fila del historial trae la foto actual de su guía: se actualiza con el cambio más reciente.
    perform public.effi_upsert_guias(p_cuenta, (
      select jsonb_agg(g) from (
        select distinct on (r ->> 'empresa', r ->> 'sucursal', r ->> 'id')
          r || jsonb_build_object('ultimo_cambio_estado', r -> 'fecha_hist_est') g
        from jsonb_array_elements(v_rows) r
        order by r ->> 'empresa', r ->> 'sucursal', r ->> 'id', r ->> 'fecha_hist_est' desc
      ) s));
  else
    raise exception 'Recurso desconocido: %', p_recurso;
  end if;
  return n;
end $$;

revoke all on function public.effi_ingest(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.effi_ingest(text, text, jsonb) to service_role;

-- Corridas más cortas y más seguidas: cada minuto.
select cron.alter_job((select jobid from cron.job where jobname = 'effi-sync'), schedule := '* * * * *');
-- Liberar el candado de la corrida que murió por CPU.
select public.effi_sync_unlock();
