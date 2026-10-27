-- Gasto publicitario de Meta por la API (función meta-gasto), en lugar de subir el CSV del BM a mano.
-- Token: usuario del sistema del portafolio, solo ads_read, cifrado en el Vault (meta_access_token).
-- Cada hora trae el gasto por día, campaña y país de entrega de todas las cuentas publicitarias que ve el token y lo
-- guarda en las mismas tablas que la carga del CSV (app_publicidad_campanas → app_publicidad_diaria). El país decide la
-- tienda igual que en el CSV; si Meta no lo sabe, la etiqueta de la campaña: (COL), (EC), (GT)…
-- Las cuentas que el token no ve (de otro portafolio) siguen saliendo del CSV: solo se reemplaza lo de las que trae.

create or replace function public.app_guardar_secreto(p_nombre text, p_valor text) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if p_nombre not in ('gmail_user', 'gmail_app_password', 'meta_access_token') then raise exception 'Secreto no permitido: %', p_nombre; end if;
  if coalesce(btrim(p_valor), '') = '' then raise exception 'Valor vacío'; end if;
  select id into v from vault.secrets where name = p_nombre;
  if v is null then perform vault.create_secret(p_valor, p_nombre);
  else perform vault.update_secret(v, p_valor, p_nombre); end if;
end $$;
revoke all on function public.app_guardar_secreto(text, text) from public, anon, authenticated;
grant execute on function public.app_guardar_secreto(text, text) to service_role;

create or replace function public.meta_credenciales() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'meta_access_token';
$$;
revoke all on function public.meta_credenciales() from public, anon, authenticated;
grant execute on function public.meta_credenciales() to service_role;

-- Cuentas publicitarias que ve el token (para saber de dónde sale cada cifra y cuándo se trajo por última vez).
create table if not exists public.meta_cuentas_ads (
  id text primary key,
  nombre text not null,
  divisa text,
  zona text,
  estado integer,
  ultima_sync timestamptz,
  ultimo_error text
);
alter table public.meta_cuentas_ads enable row level security;

-- Guarda lo que trajo la API para unas cuentas publicitarias y un rango de días: reemplaza sus campañas de esos días
-- (si una campaña cambió de nombre no queda doble) y rehace el total diario por tienda y cuenta.
-- p_filas: [{pais, fecha, cuenta_ads, campana, monto_cop}]. Países sin tienda se omiten.
create or replace function public.meta_guardar(p_filas jsonb, p_cuentas_ads text[], p_desde date, p_hasta date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_n integer; v_omitidas integer;
begin
  drop table if exists pg_temp._meta;
  create temp table _meta on commit drop as
  select a.slug as cuenta, r.fecha, btrim(r.cuenta_ads) as cuenta_ads, r.campana, sum(r.monto_cop) as monto_cop
  from jsonb_to_recordset(p_filas) as r(pais text, fecha date, cuenta_ads text, campana text, monto_cop numeric)
  join public.effi_accounts a on a.pais = r.pais and a.tipo = 'tienda'
  where r.fecha between p_desde and p_hasta
  group by 1, 2, 3, 4;
  v_n := jsonb_array_length(p_filas);
  v_omitidas := v_n - (select count(*) from jsonb_to_recordset(p_filas) as r(pais text) join public.effi_accounts a on a.pais = r.pais and a.tipo = 'tienda');

  delete from public.app_publicidad_campanas c
  where c.cuenta_ads = any (p_cuentas_ads) and c.fecha between p_desde and p_hasta;
  insert into public.app_publicidad_campanas (cuenta, fecha, cuenta_ads, campana, monto_cop, carga_id)
  select cuenta, fecha, cuenta_ads, campana, monto_cop, null from pg_temp._meta;

  delete from public.app_publicidad_diaria d
  where d.cuenta_ads = any (p_cuentas_ads) and d.fecha between p_desde and p_hasta;
  insert into public.app_publicidad_diaria (cuenta, fecha, cuenta_ads, monto_cop)
  select cuenta, fecha, cuenta_ads, sum(monto_cop) from pg_temp._meta group by 1, 2, 3;

  return jsonb_build_object('filas', v_n - v_omitidas, 'omitidas', v_omitidas,
    'por_tienda', (select coalesce(jsonb_object_agg(cuenta, round(t)), '{}'::jsonb) from (select cuenta, sum(monto_cop) t from pg_temp._meta group by 1) x));
end $$;
revoke all on function public.meta_guardar(jsonb, text[], date, date) from public, anon, authenticated;
grant execute on function public.meta_guardar(jsonb, text[], date, date) to service_role;

-- Cada hora (al minuto 20): los últimos 3 días (Meta sigue ajustando el gasto de ayer y antier).
create or replace function public.meta_refrescar() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/meta-gasto',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 150000);
$$;
revoke all on function public.meta_refrescar() from public, anon, authenticated;
select cron.schedule('meta-gasto-hora', '20 * * * *', $$ select public.meta_refrescar(); $$);
