-- 🤖 Agente · creación real (SOLO GUATEMALA: Costa Rica, Ecuador y Colombia funcionan distinto).
-- El dueño pulsa "Ejecutar" en una orden lista: auto_decidir la marca y llama a auto-convertir?crear=…, que crea la
-- remisión en Effi y luego la guía. Cada paso queda en auto_eventos (bitácora en vivo del Agente) y el resultado o
-- el error de Effi, con lo enviado y lo respondido, queda en el plan de la orden.

create table public.auto_eventos (
  id bigint generated always as identity primary key,
  cuenta text not null references public.effi_accounts (slug),
  sucursal integer,
  id_orden integer,
  paso text not null,          -- inicio, remision, guia, fin
  ok boolean,                  -- null = en curso
  mensaje text not null,
  datos jsonb,                 -- lo enviado y lo respondido por Effi
  creado_en timestamptz not null default now()
);
create index auto_eventos_cuenta on public.auto_eventos (cuenta, creado_en desc);
alter table public.auto_eventos enable row level security;
create policy auto_eventos_leer on public.auto_eventos for select to authenticated
  using (cuenta = any ((select public.app_cuentas_visibles('automatizacion'))::text[]));

create function public.auto_evento(p_cuenta text, p_sucursal integer, p_id integer, p_paso text, p_ok boolean, p_mensaje text, p_datos jsonb default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.auto_eventos (cuenta, sucursal, id_orden, paso, ok, mensaje, datos)
  values (p_cuenta, p_sucursal, p_id, p_paso, p_ok, left(p_mensaje, 1000), p_datos);
$$;

-- Resultado de una creación: 'creada' (remisión y guía hechas) o 'error' (con el paso y el mensaje de Effi).
create function public.auto_resultado(p_cuenta text, p_sucursal integer, p_id integer, p_estado text, p_motivo text, p_resultado jsonb)
returns void language sql security definer set search_path = '' as $$
  update public.auto_ordenes
  set plan_estado = p_estado, plan_motivo = p_motivo, plan = coalesce(plan, '{}'::jsonb) || jsonb_build_object('resultado', p_resultado),
      plan_en = now(), decision = null, decision_en = null
  where cuenta = p_cuenta and sucursal = p_sucursal and id = p_id;
$$;

-- La simulación no pisa una orden que se está creando o que ya tiene resultado.
create or replace function public.auto_guardar_plan(p_cuenta text, p_planes jsonb, p_reglas jsonb default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.auto_ordenes a set
    articulos = coalesce(p->'articulos', a.articulos),
    plan = p->'plan', plan_estado = p->>'estado', plan_motivo = p->>'motivo', plan_en = now()
  from jsonb_array_elements(p_planes) p
  where a.cuenta = p_cuenta and a.sucursal = (p->>'sucursal')::int and a.id = (p->>'id')::int
    and a.decision is distinct from 'ejecutar' and a.plan_estado is distinct from 'creada'
    and not (a.plan_estado = 'error' and coalesce(a.plan ? 'resultado', false));
  get diagnostics n = row_count;
  update public.auto_config set ultima_conversion = now(), error_conversion = null,
    reglas = coalesce(p_reglas, reglas), reglas_en = case when p_reglas is null then reglas_en else now() end
  where cuenta = p_cuenta;
  return n;
end $$;

-- "Ejecutar": solo el dueño, solo Guatemala, solo una orden con plan listo (o que falló y se reintenta).
create or replace function public.auto_decidir(p_cuenta text, p_sucursal integer, p_id integer, p_decision text) returns void
language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño puede decidir'; end if;
  if p_decision = 'ejecutar' then
    if p_cuenta <> 'TIENDA_GT' then raise exception 'La creación automática solo está montada para Guatemala'; end if;
    select * into o from public.auto_ordenes where cuenta = p_cuenta and sucursal = p_sucursal and id = p_id;
    if o is null or o.plan_estado not in ('lista', 'error') or o.plan is null or o.plan->'remision' is null then
      raise exception 'Esta orden no tiene una remisión lista para crear';
    end if;
  end if;
  update public.auto_ordenes
  set decision = p_decision, decision_en = case when p_decision is null then null else now() end,
      decision_por = case when p_decision is null then null else (select email from auth.users where id = auth.uid()) end
  where cuenta = p_cuenta and sucursal = p_sucursal and id = p_id;
  if p_decision = 'ejecutar' then
    perform public.auto_evento(p_cuenta, p_sucursal, p_id, 'inicio', null,
      'Orden enviada a crear por ' || coalesce((select email from auth.users where id = auth.uid()), 'el dueño'));
    perform net.http_post(
      url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-convertir?cuenta=' || p_cuenta || '&crear=' || p_sucursal || '-' || p_id,
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  end if;
end $$;

-- auto_lista: el plan, su estado y su resultado se devuelven siempre (también en órdenes ya completas).
do $$
declare def text;
begin
  select pg_get_functiondef('public.auto_lista(text, integer)'::regprocedure) into def;
  def := replace(def, $a$'plan', case when estado in ('sin_remision', 'sin_guia') then plan end,$a$, $b$'plan', plan,$b$);
  def := replace(def, $a$'plan_estado', case when estado in ('sin_remision', 'sin_guia') then plan_estado end,$a$, $b$'plan_estado', plan_estado,$b$);
  def := replace(def, $a$'plan_motivo', case when estado in ('sin_remision', 'sin_guia') then plan_motivo end,$a$, $b$'plan_motivo', plan_motivo,$b$);
  if position($a$'plan', plan,$a$ in def) = 0 then raise exception 'auto_lista cambió: no se pudo ajustar'; end if;
  execute def;
end $$;

revoke all on function public.auto_evento(text, integer, integer, text, boolean, text, jsonb) from public, anon, authenticated;
revoke all on function public.auto_resultado(text, integer, integer, text, text, jsonb) from public, anon, authenticated;
