-- Colombia, regla del dueño (4-nov): guía con recaudo menor de $150.000 y flete mayor de $30.000. ValerIA avisa y una persona
-- decide: la aprueba (queda quién y cuándo) o, si no tiene relación de despacho, la anula y resuelve en la remisión.
create table public.auto_flete_alertas (
  cuenta text not null,
  sucursal integer not null,
  id_guia bigint not null,
  relacion text,             -- relación de despacho, revisada en Effi (Effi no avisa cuándo la ponen)
  relacion_en timestamptz,
  decision text check (decision in ('aprobada', 'anulando', 'anulada')),
  decision_por text,
  decision_en timestamptz,
  error text,
  primary key (cuenta, sucursal, id_guia)
);
alter table public.auto_flete_alertas enable row level security;

create index effi_guias_flete_alto on public.effi_guias (cuenta, fecha_trans desc)
  where vigente and recaudo and valor_flete > 30000 and valor_recaudo < 150000;

-- La regla, en un solo lugar. Los montos son en pesos colombianos: solo aplica a Colombia.
create or replace function public.auto_guias_flete_alto(p_cuenta text) returns setof public.effi_guias
language sql stable set search_path = '' as $$
  select g.* from public.effi_guias g
  where g.cuenta = p_cuenta and p_cuenta = 'TIENDA_CO' and g.vigente and g.recaudo and g.valor_flete > 30000 and g.valor_recaudo < 150000;
$$;
revoke all on function public.auto_guias_flete_alto(text) from public, anon, authenticated;

-- Alertas para la pantalla: lo que falta decidir (no aplica a guías ya entregadas o devueltas, ni a las que ya tienen
-- relación de despacho, regla del dueño), las anuladas cuya remisión
-- sigue sin guía y las últimas aprobadas con quién las aprobó.
create or replace function public.auto_fletes_lista(p_cuenta text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('automatizacion')) as ok),
  -- Solo las guías de la regla y las ya decididas: nunca se recorren todas las guías del país.
  ids as (
    select r.sucursal, r.id, true as en_regla from public.auto_guias_flete_alto(p_cuenta) r where (select ok from permitido)
    union
    select a.sucursal, a.id_guia, false from public.auto_flete_alertas a
    where a.cuenta = p_cuenta and a.decision in ('aprobada', 'anulada') and (select ok from permitido)
  ),
  fila as (
    select g.sucursal, g.id, g.guia, split_part(g.nombre_transportadora_efficommerce, ' ', 1) as transportadora,
      g.nombre_destinatario as cliente, g.nombre_ciudad_destinatario as ciudad, g.nombre_provincia_destinatario as provincia,
      g.valor_recaudo as recaudo, g.valor_flete as flete, g.estado_efficommerce as estado, g.est_guia_efficommerce as est,
      g.id_ref as remision, g.sucursal_ref, g.fecha_trans as fecha, g.nombre_centro_costos as centro,
      bool_or(i.en_regla) over (partition by g.sucursal, g.id) as en_regla,
      a.relacion, a.relacion_en, a.decision, a.decision_por, a.decision_en, a.error
    from ids i
    join public.effi_guias g on g.cuenta = p_cuenta and g.sucursal = i.sucursal and g.id = i.id
    left join public.auto_flete_alertas a on a.cuenta = g.cuenta and a.sucursal = g.sucursal and a.id_guia = g.id
  ),
  salida as (select distinct on (f.sucursal, f.id) to_jsonb(f) - 'sucursal_ref' - 'en_regla' as j, f.* from fila f)
  select jsonb_build_object(
    'pendientes', coalesce((select jsonb_agg(s.j || jsonb_build_object('anulable', s.est in (1, 7)) order by s.fecha desc)
      from salida s
      where s.en_regla and s.est is distinct from 4 and s.est is distinct from 5 and s.decision is distinct from 'aprobada' and s.relacion is null), '[]'::jsonb),
    'anuladas', coalesce((select jsonb_agg(s.j order by s.decision_en desc) from salida s
      where s.decision = 'anulada' and s.decision_en > now() - interval '5 days'
        and not exists (select 1 from public.effi_guias n where n.cuenta = p_cuenta and n.t_trans_ref = 4 and n.id_ref = s.remision
          and n.sucursal_ref = s.sucursal_ref and n.vigente)
        and not exists (select 1 from public.auto_ordenes o where o.cuenta = p_cuenta and o.id_remision = s.remision
          and o.sucursal_remision = s.sucursal_ref and o.rem_vigente is false)), '[]'::jsonb),
    'aprobadas', coalesce((select jsonb_agg(x.j) from (select s.j from salida s where s.decision = 'aprobada' order by s.decision_en desc limit 30) x), '[]'::jsonb)
  );
$$;
revoke all on function public.auto_fletes_lista(text) from public, anon;
grant execute on function public.auto_fletes_lista(text) to authenticated;

-- Aprobar: queda quién y cuándo, también en la bitácora del agente.
create or replace function public.auto_flete_aprobar(p_cuenta text, p_sucursal integer, p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_por text := (select email from auth.users where id = auth.uid()); v_guia text;
begin
  if not (p_cuenta = any (public.app_cuentas_visibles('automatizacion'))) then raise exception 'No tienes permiso en este país'; end if;
  select r.guia into v_guia from public.auto_guias_flete_alto(p_cuenta) r where r.sucursal = p_sucursal and r.id = p_id;
  if v_guia is null then raise exception 'Esta guía ya no tiene alerta de flete'; end if;
  if exists (select 1 from public.auto_flete_alertas a where a.cuenta = p_cuenta and a.sucursal = p_sucursal and a.id_guia = p_id
             and a.decision = 'anulando' and a.decision_en > now() - interval '3 minutes') then
    raise exception 'Esta guía se está anulando'; end if;
  insert into public.auto_flete_alertas (cuenta, sucursal, id_guia, decision, decision_por, decision_en)
  values (p_cuenta, p_sucursal, p_id, 'aprobada', v_por, now())
  on conflict (cuenta, sucursal, id_guia) do update set decision = 'aprobada', decision_por = v_por, decision_en = now(), error = null;
  perform public.auto_evento(p_cuenta, null, null, 'guia', true, 'Guía ' || v_guia || ': flete alto aprobado por ' || coalesce(v_por, 'una persona'));
end $$;
revoke all on function public.auto_flete_aprobar(text, integer, bigint) from public, anon;
grant execute on function public.auto_flete_aprobar(text, integer, bigint) to authenticated;

-- Pedir la anulación: la hace auto-convertir, que revisa otra vez en Effi. Una a la vez por guía; si la anulación se corta,
-- a los 3 minutos se puede volver a pedir.
create or replace function public.auto_flete_anular(p_cuenta text, p_sucursal integer, p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_por text := (select email from auth.users where id = auth.uid()); g record; a record;
begin
  if not (p_cuenta = any (public.app_cuentas_visibles('automatizacion'))) then raise exception 'No tienes permiso en este país'; end if;
  select r.* into g from public.auto_guias_flete_alto(p_cuenta) r where r.sucursal = p_sucursal and r.id = p_id;
  if g.id is null then raise exception 'Esta guía ya no tiene alerta de flete'; end if;
  if g.est_guia_efficommerce not in (1, 7) then raise exception 'La guía ya salió (%): Effi no deja anularla', g.estado_efficommerce; end if;
  select * into a from public.auto_flete_alertas x where x.cuenta = p_cuenta and x.sucursal = p_sucursal and x.id_guia = p_id;
  if a.relacion is not null then raise exception 'Esta guía ya tiene relación de despacho'; end if;
  if a.decision = 'anulando' and a.decision_en > now() - interval '3 minutes' then raise exception 'Esta guía ya se está anulando'; end if;
  insert into public.auto_flete_alertas (cuenta, sucursal, id_guia, decision, decision_por, decision_en)
  values (p_cuenta, p_sucursal, p_id, 'anulando', v_por, now())
  on conflict (cuenta, sucursal, id_guia) do update set decision = 'anulando', decision_por = v_por, decision_en = now(), error = null;
  perform public.auto_evento(p_cuenta, null, null, 'guia', null, 'Guía ' || g.guia || ': anulación por flete alto pedida por ' || coalesce(v_por, 'una persona'));
  perform net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-convertir?cuenta=' || p_cuenta || '&anular_guia=' || p_sucursal || '-' || p_id,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
end $$;
revoke all on function public.auto_flete_anular(text, integer, bigint) from public, anon;
grant execute on function public.auto_flete_anular(text, integer, bigint) to authenticated;

-- Solo auto-convertir: guías por revisar en Effi, su relación de despacho y el resultado de la anulación.
create or replace function public.auto_fletes_por_revisar(p_cuenta text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('sucursal', r.sucursal, 'id', r.id)), '[]'::jsonb)
  from public.auto_guias_flete_alto(p_cuenta) r
  left join public.auto_flete_alertas a on a.cuenta = r.cuenta and a.sucursal = r.sucursal and a.id_guia = r.id
  where r.est_guia_efficommerce is distinct from 4 and r.est_guia_efficommerce is distinct from 5 and a.decision is distinct from 'aprobada'
    and (a.relacion is null or r.est_guia_efficommerce in (1, 7));
$$;
create or replace function public.auto_flete_relacion(p_cuenta text, p_sucursal integer, p_id bigint, p_relacion text)
returns void language sql security definer set search_path = '' as $$
  insert into public.auto_flete_alertas (cuenta, sucursal, id_guia, relacion, relacion_en) values (p_cuenta, p_sucursal, p_id, p_relacion, now())
  on conflict (cuenta, sucursal, id_guia) do update set relacion = excluded.relacion, relacion_en = now();
$$;
-- Si se anuló, la guía sale de effi_guias y de la orden sin esperar la sincronización, y la remisión vuelve a quedar sin guía.
create or replace function public.auto_flete_resultado(p_cuenta text, p_sucursal integer, p_id bigint, p_ok boolean, p_mensaje text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_guia text;
begin
  update public.auto_flete_alertas set
    decision = case when p_ok then 'anulada' end, error = p_mensaje,
    decision_por = case when p_ok then decision_por end, decision_en = case when p_ok then now() end
  where cuenta = p_cuenta and sucursal = p_sucursal and id_guia = p_id;
  if p_ok then
    update public.effi_guias set vigente = false, fecha_anular = coalesce(fecha_anular, now())
    where cuenta = p_cuenta and sucursal = p_sucursal and id = p_id returning guia into v_guia;
    update public.auto_ordenes set guia = null, id_guia = null where cuenta = p_cuenta and guia = v_guia;
  end if;
end $$;
revoke all on function public.auto_fletes_por_revisar(text) from public, anon, authenticated;
revoke all on function public.auto_flete_relacion(text, integer, bigint, text) from public, anon, authenticated;
revoke all on function public.auto_flete_resultado(text, integer, bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.auto_fletes_por_revisar(text) to service_role;
grant execute on function public.auto_flete_relacion(text, integer, bigint, text) to service_role;
grant execute on function public.auto_flete_resultado(text, integer, bigint, boolean, text) to service_role;
