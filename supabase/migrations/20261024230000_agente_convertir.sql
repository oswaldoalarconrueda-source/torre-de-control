-- 🤖 Agente · conversión de órdenes de venta (por ahora solo SIMULACIÓN: no crea nada en Effi).
--
-- Cada país tiene su programación: corre cada `cada_min` minutos y además `antes_min` minutos antes de cada
-- hora de corte de despacho (`cortes`, hora local), para que la remisión y la guía queden hechas antes del corte.
-- En cada corrida la función auto-convertir arma, por cada orden vigente sin remisión, la remisión que crearía
-- (convenio de la orden, centro de costos Recuperado si el cliente empieza con *, productos y cantidades) y la
-- guía (transportadora, servicio, forma de pago y remitente que se usan con ese convenio). Lo guarda en `plan`.

alter table public.auto_config drop constraint auto_config_modo_check;
alter table public.auto_config add constraint auto_config_modo_check check (modo in ('apagado', 'vigilar', 'simular', 'automatico'));
alter table public.auto_config
  add column cada_min integer not null default 10 check (cada_min between 2 and 60),
  add column cortes text[] not null default array['11:00', '12:00', '13:00', '14:00', '15:00'],
  add column antes_min integer not null default 2 check (antes_min between 0 and 30),
  add column ultima_conversion timestamptz,
  add column error_conversion text,
  -- Lo que se aprende de las guías hechas: remitente por convenio y parámetros fijos de la transportadora.
  add column reglas jsonb,
  add column reglas_en timestamptz;
update public.auto_config set modo = 'simular' where cuenta = 'TIENDA_GT';

alter table public.auto_ordenes
  add column articulos jsonb,          -- artículos detectados en la orden (id, nombre), se guardan para no repetir
  add column plan jsonb,               -- remisión y guía que se crearían
  add column plan_estado text check (plan_estado in ('lista', 'revision', 'creada', 'error')),
  add column plan_motivo text,
  add column plan_en timestamptz;

-- Historial de contenido de guías por valor declarado: de aquí sale la cantidad de cada producto según el total.
create function public.auto_historial_contenido(p_cuenta text) returns table (total numeric, contenido text, n bigint)
language sql stable security definer set search_path = '' as $$
  select g.valor_declarado, g.contenido, count(*)
  from public.effi_guias g
  where g.cuenta = p_cuenta and g.vigente is not false and g.fecha_anular is null and g.contenido is not null
    and g.fecha_trans > now() - interval '120 days'
  group by 1, 2;
$$;

-- Guarda lo que armó la simulación (o, más adelante, lo que se creó).
create function public.auto_guardar_plan(p_cuenta text, p_planes jsonb, p_reglas jsonb default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.auto_ordenes a set
    articulos = coalesce(p->'articulos', a.articulos),
    plan = p->'plan', plan_estado = p->>'estado', plan_motivo = p->>'motivo', plan_en = now()
  from jsonb_array_elements(p_planes) p
  where a.cuenta = p_cuenta and a.sucursal = (p->>'sucursal')::int and a.id = (p->>'id')::int;
  get diagnostics n = row_count;
  update public.auto_config set ultima_conversion = now(), error_conversion = null,
    reglas = coalesce(p_reglas, reglas), reglas_en = case when p_reglas is null then reglas_en else now() end
  where cuenta = p_cuenta;
  return n;
end $$;

create function public.auto_error_conversion(p_cuenta text, p_error text) returns void
language sql security definer set search_path = '' as $$
  update public.auto_config set ultima_conversion = now(), error_conversion = left(p_error, 500) where cuenta = p_cuenta;
$$;

-- El dueño cambia la programación de su país.
create function public.auto_guardar_horario(p_cuenta text, p_cada_min integer, p_cortes text[], p_antes_min integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño puede cambiar el horario'; end if;
  if exists (select 1 from unnest(p_cortes) c where c !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
    raise exception 'Las horas de corte van en formato HH:MM';
  end if;
  update public.auto_config
  set cada_min = p_cada_min, cortes = (select array_agg(c order by c) from unnest(p_cortes) c), antes_min = p_antes_min,
      actualizado_en = now(), actualizado_por = (select email from auth.users where id = auth.uid())
  where cuenta = p_cuenta;
end $$;

-- "simular" se puede elegir; "automatico" sigue bloqueado hasta aprobar la creación real.
create or replace function public.auto_cambiar_modo(p_cuenta text, p_modo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño puede cambiar el modo'; end if;
  if p_modo = 'automatico' then raise exception 'La creación automática aún no está activada'; end if;
  update public.auto_config
  set modo = p_modo, actualizado_en = now(), actualizado_por = (select email from auth.users where id = auth.uid())
  where cuenta = p_cuenta;
end $$;

-- Reloj del agente (cron cada minuto): dispara auto-convertir para los países a los que les toca ahora, según
-- su hora local: cada `cada_min` minutos o `antes_min` minutos antes de un corte.
create function public.auto_convertir_tick() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0; local timestamp; hhmm text;
begin
  for r in
    select c.cuenta, c.cada_min, c.cortes, c.antes_min, a.tz_offset_min
    from public.auto_config c join public.effi_accounts a on a.slug = c.cuenta
    where c.modo in ('simular', 'automatico')
  loop
    local := (now() at time zone 'UTC') + make_interval(mins => r.tz_offset_min);
    hhmm := to_char(local + make_interval(mins => r.antes_min), 'HH24:MI');
    if extract(minute from local)::int % r.cada_min = 0 or hhmm = any (r.cortes) then
      perform net.http_post(
        url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-convertir?cuenta=' || r.cuenta,
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
        body := '{}'::jsonb, timeout_milliseconds := 10000);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke all on function public.auto_historial_contenido(text) from public, anon, authenticated;
revoke all on function public.auto_guardar_plan(text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.auto_error_conversion(text, text) from public, anon, authenticated;
revoke all on function public.auto_convertir_tick() from public, anon, authenticated;
revoke all on function public.auto_guardar_horario(text, integer, text[], integer) from public, anon;
grant execute on function public.auto_guardar_horario(text, integer, text[], integer) to authenticated;

-- Cron (programado tras desplegar la función): select cron.schedule('auto-convertir', '* * * * *', 'select public.auto_convertir_tick();');
