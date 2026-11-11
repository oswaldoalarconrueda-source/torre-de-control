-- 🤖 Agente: cambiar la dirección de la orden y anular la orden desde la lista (pedido del dueño, 11-nov-2026). Cada acción
-- queda en auto_acciones y la ejecuta la función agente-acciones en Effi (PUT / DELETE api/orden_v), una a la vez. Anular
-- está en todos los países (decisión del dueño). Al cambiar la dirección, el plan del agente se rehace con la nueva.

create table if not exists public.auto_acciones (
  id bigint generated always as identity primary key,
  cuenta text not null references public.effi_accounts (slug),
  sucursal integer not null,
  orden_id integer not null,
  tipo text not null check (tipo in ('direccion', 'anular')),
  datos jsonb not null default '{}'::jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'ok', 'error')),
  mensaje text,
  por text,
  creado_en timestamptz not null default now(),
  hecho_en timestamptz
);
create index if not exists auto_acciones_orden on public.auto_acciones (cuenta, sucursal, orden_id, creado_en desc);
alter table public.auto_acciones enable row level security;

-- Catálogo global de ciudades de Effi por país (se carga con agente-acciones?catalogo=1).
create table if not exists public.effi_ciudades (
  pais_id integer not null,
  provincia_id integer not null,
  provincia text not null,
  ciudad_id integer primary key,
  ciudad text not null
);
create index if not exists effi_ciudades_pais on public.effi_ciudades (pais_id, provincia);
alter table public.effi_ciudades enable row level security;

create or replace function public.effi_ciudades_cargar(p_filas jsonb) returns integer
language sql security definer set search_path = '' as $$
  with f as (
    insert into public.effi_ciudades (pais_id, provincia_id, provincia, ciudad_id, ciudad)
    select (x->>'pais_id')::int, (x->>'provincia_id')::int, x->>'provincia', (x->>'ciudad_id')::int, x->>'ciudad'
    from jsonb_array_elements(p_filas) x
    on conflict (ciudad_id) do update set pais_id = excluded.pais_id, provincia_id = excluded.provincia_id,
      provincia = excluded.provincia, ciudad = excluded.ciudad
    returning 1)
  select count(*)::int from f;
$$;
revoke all on function public.effi_ciudades_cargar(jsonb) from public, anon, authenticated;

-- Buscar ciudad por nombre en el país de la tienda (para cambiar la dirección).
create or replace function public.effi_ciudades_buscar(p_cuenta text, p_q text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with p as (
    select o.pais_id from public.auto_ordenes o
    where o.cuenta = p_cuenta and o.pais_id is not null and p_cuenta = any (public.app_cuentas_visibles('automatizacion'))
    order by o.fecha_orden desc limit 1)
  select coalesce(jsonb_agg(jsonb_build_object('pais_id', c.pais_id, 'provincia_id', c.provincia_id, 'provincia', c.provincia,
      'ciudad_id', c.ciudad_id, 'ciudad', c.ciudad) order by length(c.ciudad), c.ciudad), '[]'::jsonb)
  from (
    select * from public.effi_ciudades c
    where c.pais_id = (select pais_id from p) and length(trim(coalesce(p_q, ''))) >= 2
      and (public.auto_norm(c.ciudad) like '%' || public.auto_norm(p_q) || '%' or public.auto_norm(c.provincia) like public.auto_norm(p_q) || '%')
    order by length(c.ciudad), c.ciudad limit 30) c;
$$;
revoke all on function public.effi_ciudades_buscar(text, text) from public, anon;
grant execute on function public.effi_ciudades_buscar(text, text) to authenticated;

-- Pedir una acción: la puede pedir quien ve el agente de ese país. Se manda enseguida a auto-convertir.
create or replace function public.auto_orden_accion(p_cuenta text, p_sucursal integer, p_id integer, p_tipo text, p_datos jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare o record; nuevo bigint; quien text := (select email from auth.users where id = auth.uid());
begin
  if not (public.app_es_owner() or p_cuenta = any (public.app_cuentas_visibles('automatizacion'))) then
    raise exception 'No tienes permiso en este país'; end if;
  if p_tipo not in ('direccion', 'anular') then raise exception 'Acción inválida'; end if;
  select * into o from public.auto_ordenes where cuenta = p_cuenta and sucursal = p_sucursal and id = p_id;
  if o is null then raise exception 'No encuentro la orden'; end if;
  if o.orden_vigente is not true then raise exception 'La orden ya está anulada en Effi'; end if;
  if p_tipo = 'direccion' then
    if o.id_remision is not null then raise exception 'La orden ya tiene remisión: la dirección se cambia en la remisión o la guía'; end if;
    if coalesce(trim(p_datos->>'direccion'), '') = '' or (p_datos->>'ciudad_id') is null then raise exception 'Falta la dirección o la ciudad'; end if;
  else
    if o.id_remision is not null then raise exception 'La orden ya tiene remisión: primero anula la remisión en Effi'; end if;
    if length(trim(coalesce(p_datos->>'motivo', ''))) < 3 then raise exception 'Escribe el motivo de la anulación'; end if;
  end if;
  if exists (select 1 from public.auto_acciones a where a.cuenta = p_cuenta and a.sucursal = p_sucursal and a.orden_id = p_id
             and a.estado = 'pendiente' and a.creado_en > now() - interval '3 minutes') then
    raise exception 'Ya hay un cambio en curso para esta orden'; end if;
  insert into public.auto_acciones (cuenta, sucursal, orden_id, tipo, datos, por)
  values (p_cuenta, p_sucursal, p_id, p_tipo, p_datos, quien) returning id into nuevo;
  perform public.auto_evento(p_cuenta, p_sucursal, p_id, 'inicio', null,
    case p_tipo when 'direccion' then 'Cambio de dirección pedido por ' else 'Anulación de la orden pedida por ' end || coalesce(quien, 'el dueño'));
  perform net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-convertir?cuenta=' || p_cuenta || '&accion=' || nuevo,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
  return nuevo;
end $$;
revoke all on function public.auto_orden_accion(text, integer, integer, text, jsonb) from public, anon;
grant execute on function public.auto_orden_accion(text, integer, integer, text, jsonb) to authenticated;

-- Resultado (lo escribe auto-convertir con la service role).
create or replace function public.auto_accion_resultado(p_id bigint, p_ok boolean, p_mensaje text) returns void
language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  update public.auto_acciones set estado = case when p_ok then 'ok' else 'error' end, mensaje = p_mensaje, hecho_en = now()
  where id = p_id returning * into a;
  if a is null then return; end if;
  if p_ok and a.tipo = 'direccion' then
    -- La orden queda con la dirección nueva y el agente vuelve a armar el plan con ella.
    update public.auto_ordenes set direccion = a.datos->>'direccion', ciudad = a.datos->>'ciudad', provincia = a.datos->>'provincia',
      ciudad_id = (a.datos->>'ciudad_id')::int, provincia_id = (a.datos->>'provincia_id')::int,
      plan = null, plan_estado = null, plan_motivo = null, plan_en = null, decision = null, actualizado_en = now()
    where cuenta = a.cuenta and sucursal = a.sucursal and id = a.orden_id;
  elsif p_ok and a.tipo = 'anular' then
    update public.auto_ordenes set orden_vigente = false, actualizado_en = now()
    where cuenta = a.cuenta and sucursal = a.sucursal and id = a.orden_id;
  end if;
  perform public.auto_evento(a.cuenta, a.sucursal, a.orden_id, 'fin', p_ok,
    case a.tipo when 'direccion' then 'Dirección ' else 'Anulación ' end || case when p_ok then 'hecha en Effi' else 'no se pudo: ' || coalesce(p_mensaje, '') end);
end $$;
revoke all on function public.auto_accion_resultado(bigint, boolean, text) from public, anon, authenticated;

-- La lista de cada orden trae también su última acción de las últimas 24 h (para ver "cambiando…" o el error).
create or replace function public.auto_acciones_recientes(p_cuenta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select distinct on (a.sucursal, a.orden_id) a.sucursal || '-' || a.orden_id as k,
      jsonb_build_object('tipo', a.tipo, 'estado', a.estado, 'mensaje', a.mensaje, 'por', a.por, 'en', coalesce(a.hecho_en, a.creado_en)) as v
    from public.auto_acciones a
    where a.cuenta = p_cuenta and a.creado_en > now() - interval '24 hours' and p_cuenta = any (public.app_cuentas_visibles('automatizacion'))
    order by a.sucursal, a.orden_id, a.creado_en desc) x;
$$;
revoke all on function public.auto_acciones_recientes(text) from public, anon;
grant execute on function public.auto_acciones_recientes(text) to authenticated;

-- La función auto-convertir (service role) escribe resultados y carga el catálogo.
grant execute on function public.effi_ciudades_cargar(jsonb), public.auto_accion_resultado(bigint, boolean, text) to service_role;
