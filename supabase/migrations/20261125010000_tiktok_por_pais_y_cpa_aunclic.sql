-- TikTok de A un clic por país y correo de CPA de A un clic (pedido del dueño, 24-nov-2026).
--
-- 1) TikTok: las tareas programadas (MCP de TikTok, solo lectura) mandan el gasto por campaña, día y PAÍS a tiktok_guardar.
--    El gasto va a la tienda de A un clic de ese país (GT, HN, SV). Si el país no tiene tienda (p. ej. Colombia), se carga
--    como Meta: a AUNCLIC_HN con el país real (sale con * rojo en Productos), queda en tiktok_fuera_pais y al dueño le llega
--    un correo con la prueba (cuenta, campaña, país, días y monto) y un aviso al celular para hacer el ajuste.
-- 2) Correo de CPA por sociedad: informe_programado.desde_hora (Joalix desde las 5 a. m., A un clic desde las 8 a. m.).
--    Sale solo cuando están los pedidos de ayer de todos sus países; si a la hora no están, sale el aviso de que faltan, y
--    apenas alguien los guarda en Pedidos plataformas el correo sale en ese momento (y el cron lo revisa cada minuto).

-- ── 1. TikTok ───────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.tiktok_fuera_pais (
  cuenta_ads text not null,
  campana text not null,
  pais text not null,
  fecha date not null,
  monto_cop numeric not null,
  compras integer not null default 0,
  tienda_cargada text not null,
  detectado_en timestamptz not null default now(),
  avisado_en timestamptz,
  primary key (cuenta_ads, campana, pais, fecha)
);
alter table public.tiktok_fuera_pais enable row level security;
create policy tiktok_fuera_pais_leer on public.tiktok_fuera_pais for select to authenticated using (public.app_es_owner());

-- p_filas: [{cuenta_ads:'TikTok · <cuenta>', fecha, campana, pais:'GT', monto_cop, compras}] de las cuentas p_cuentas_ads entre
-- p_desde y p_hasta. Reemplaza lo que había de esas cuentas en ese rango (en todas las tiendas de A un clic).
create or replace function public.tiktok_guardar(p_filas jsonb, p_cuentas_ads text[], p_desde date, p_hasta date)
returns jsonb
language plpgsql security definer set search_path to '' as $function$
declare v_fuera jsonb;
begin
  if exists (select 1 from unnest(p_cuentas_ads) c where c not like 'TikTok · %') then
    raise exception 'Solo cuentas de TikTok (cuenta_ads empieza por «TikTok · »)';
  end if;
  drop table if exists pg_temp._tt;
  create temp table _tt on commit drop as
  select coalesce(a.slug, 'AUNCLIC_HN') as cuenta, a.slug is null as fuera, r.fecha, btrim(r.cuenta_ads) as cuenta_ads,
    btrim(r.campana) as campana, upper(btrim(r.pais)) as pais, sum(r.monto_cop) as monto_cop, sum(coalesce(r.compras, 0))::int as compras
  from jsonb_to_recordset(p_filas) as r(cuenta_ads text, fecha date, campana text, pais text, monto_cop numeric, compras numeric)
  left join public.effi_accounts a on a.sociedad = 'A un clic' and a.tipo = 'tienda' and a.pais = upper(btrim(r.pais))
  where r.fecha between p_desde and p_hasta and btrim(r.cuenta_ads) = any (p_cuentas_ads) and coalesce(r.monto_cop, 0) > 0
  group by 1, 2, 3, 4, 5, 6;

  delete from public.app_publicidad_campanas c
  where c.cuenta_ads = any (p_cuentas_ads) and c.fecha between p_desde and p_hasta
    and c.cuenta in (select slug from public.effi_accounts where sociedad = 'A un clic');
  insert into public.app_publicidad_campanas (cuenta, fecha, cuenta_ads, campana, monto_cop, pais, compras, actualizado_en)
  select cuenta, fecha, cuenta_ads, campana, round(sum(monto_cop)), string_agg(distinct pais, ',' order by pais), sum(compras), now()
  from pg_temp._tt group by cuenta, fecha, cuenta_ads, campana;

  delete from public.app_publicidad_diaria d
  where d.cuenta_ads = any (p_cuentas_ads) and d.fecha between p_desde and p_hasta
    and d.cuenta in (select slug from public.effi_accounts where sociedad = 'A un clic');
  insert into public.app_publicidad_diaria (cuenta, fecha, cuenta_ads, monto_cop, actualizado_en)
  select cuenta, fecha, cuenta_ads, sum(monto_cop), now() from public.app_publicidad_campanas
  where cuenta_ads = any (p_cuentas_ads) and fecha between p_desde and p_hasta
    and cuenta in (select slug from public.effi_accounts where sociedad = 'A un clic')
  group by 1, 2, 3;

  -- Gasto en países sin tienda: queda registrado para avisar (lo ya avisado conserva su marca).
  delete from public.tiktok_fuera_pais f
  where f.cuenta_ads = any (p_cuentas_ads) and f.fecha between p_desde and p_hasta
    and not exists (select 1 from pg_temp._tt t where t.fuera and t.cuenta_ads = f.cuenta_ads and t.campana = f.campana
                    and t.pais = f.pais and t.fecha = f.fecha);
  insert into public.tiktok_fuera_pais (cuenta_ads, campana, pais, fecha, monto_cop, compras, tienda_cargada)
  select cuenta_ads, campana, pais, fecha, round(monto_cop), compras, cuenta from pg_temp._tt where fuera
  on conflict (cuenta_ads, campana, pais, fecha) do update set monto_cop = excluded.monto_cop, compras = excluded.compras,
    tienda_cargada = excluded.tienda_cargada;

  select coalesce(jsonb_agg(jsonb_build_object('cuenta_ads', cuenta_ads, 'campana', campana, 'pais', pais, 'fecha', fecha,
           'monto_cop', round(monto_cop)) order by fecha, cuenta_ads, campana), '[]'::jsonb)
    into v_fuera from pg_temp._tt where fuera;
  return jsonb_build_object(
    'por_tienda', (select coalesce(jsonb_object_agg(cuenta, t), '{}'::jsonb) from (select cuenta, round(sum(monto_cop)) t from pg_temp._tt group by 1) x),
    'por_cuenta', (select coalesce(jsonb_object_agg(cuenta_ads, t), '{}'::jsonb) from (select cuenta_ads, round(sum(monto_cop)) t from pg_temp._tt group by 1) x),
    'fuera_de_pais', v_fuera);
end $function$;
revoke all on function public.tiktok_guardar(jsonb, text[], date, date) from public, anon, authenticated;

-- Correo al dueño (y aviso al celular) con la prueba del gasto de TikTok en países donde A un clic no vende. Solo lo nuevo.
create or replace function public.tiktok_fuera_pais_avisar()
returns text
language plpgsql security definer set search_path to '' as $function$
declare v_filas text; v_total numeric; v_n int; v_para text;
begin
  select count(*), sum(monto_cop) into v_n, v_total from public.tiktok_fuera_pais where avisado_en is null;
  if v_n = 0 then return 'nada nuevo fuera de país'; end if;
  select u.email into v_para from public.app_usuarios u where u.rol = 'owner' and u.activo limit 1;
  select string_agg(format(
    '<tr><td style="padding:6px 8px;border-top:1px solid #1e2740">%s</td><td style="padding:6px 8px;border-top:1px solid #1e2740">%s</td>'
    '<td style="padding:6px 8px;border-top:1px solid #1e2740;font-weight:700;color:#ffb347">%s</td><td style="padding:6px 8px;border-top:1px solid #1e2740">%s a %s (%s días)</td>'
    '<td style="padding:6px 8px;border-top:1px solid #1e2740;text-align:right;font-weight:700">$%s</td><td style="padding:6px 8px;border-top:1px solid #1e2740;text-align:right">%s</td></tr>',
    replace(cuenta_ads, 'TikTok · ', ''), campana, pais, to_char(desde, 'DD/MM'), to_char(hasta, 'DD/MM'), dias,
    to_char(monto, 'FM999G999G999'), compras), '' order by monto desc)
  into v_filas
  from (select cuenta_ads, campana, pais, min(fecha) desde, max(fecha) hasta, count(*) dias, sum(monto_cop) monto, sum(compras) compras
        from public.tiktok_fuera_pais where avisado_en is null group by cuenta_ads, campana, pais) x;

  perform net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/correo',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := jsonb_build_object('para', jsonb_build_array(v_para),
      'asunto', format('⚠️ A un clic · TikTok gastó $%s en países donde no vendemos', to_char(v_total, 'FM999G999G999')),
      'html', format('<div style="background:#070b16;padding:20px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e8edf7">'
        '<div style="font-size:20px;font-weight:800;color:#ffb347">⚠️ Gasto de TikTok fuera de los países de A un clic</div>'
        '<p style="color:#c9d2e6;font-size:14px;line-height:1.5">TikTok reporta gasto dirigido a países donde A un clic no tiene tienda (vende en Guatemala, Honduras y El Salvador). '
        'Sale del reporte de audiencia por país de TikTok (country_code), cuenta por cuenta. Total: <b>$%s COP</b>.</p>'
        '<table style="width:100%%;border-collapse:collapse;font-size:13px;color:#e8edf7;background:#0f1526;border:1px solid #1e2740">'
        '<tr style="color:#8a96b3;text-align:left"><th style="padding:6px 8px">Cuenta TikTok</th><th style="padding:6px 8px">Campaña</th><th style="padding:6px 8px">País</th>'
        '<th style="padding:6px 8px">Días</th><th style="padding:6px 8px;text-align:right">Gasto COP</th><th style="padding:6px 8px;text-align:right">Conversiones</th></tr>%s</table>'
        '<p style="color:#c9d2e6;font-size:13px;line-height:1.5">Mientras se decide el ajuste, quedó cargado como Meta: en 🇭🇳 Honduras con su país real (sale con * rojo en Productos). '
        'Revisa la segmentación de esas campañas en TikTok o dime a qué tienda se debe cargar.</p></div>',
        to_char(v_total, 'FM999G999G999'), v_filas)),
    timeout_milliseconds := 30000);
  perform public.push_avisar('tiktok', '⚠️ TikTok fuera de país', format('A un clic gastó $%s en TikTok en países donde no vende. Te mandé el detalle por correo.',
    to_char(v_total, 'FM999G999G999')), '/publicidad');
  update public.tiktok_fuera_pais set avisado_en = now() where avisado_en is null;
  return format('avisado: %s filas, $%s', v_n, round(v_total));
end $function$;
revoke all on function public.tiktok_fuera_pais_avisar() from public, anon, authenticated;

-- ── 2. Correo de CPA por sociedad ─────────────────────────────────────────────────────────────────────────────────────
alter table public.informe_programado add column if not exists desde_hora integer not null default 5;

-- Gasto de publicidad (Meta + TikTok) ÷ pedidos, con la parte de TikTok aparte para el correo.
create or replace function public.informe_cpa(p_dia date, p_sociedad text)
returns jsonb
language sql stable security definer set search_path to '' as $function$
  with t as (
    select a.slug as cuenta from public.effi_accounts a
    where a.tipo = 'tienda' and a.activa and (p_sociedad is null or a.sociedad = p_sociedad)
  ),
  per as (
    select t.cuenta, x.desde, x.clave from t
    cross join (values (p_dia, 'dia'), (p_dia - 6, 'semana'), (date_trunc('month', p_dia)::date, 'mes')) as x(desde, clave)
  ),
  g as (
    select per.cuenta, per.clave,
      coalesce((select sum(d.monto_cop) from public.app_publicidad_diaria d
                where d.cuenta = per.cuenta and d.fecha between per.desde and p_dia
                  and exists (select 1 from public.v_pedidos_dia p where p.cuenta = d.cuenta and p.fecha = d.fecha)), 0) as gasto,
      coalesce((select sum(d.monto_cop) from public.app_publicidad_diaria d
                where d.cuenta = per.cuenta and d.fecha between per.desde and p_dia and d.cuenta_ads like 'TikTok · %'
                  and exists (select 1 from public.v_pedidos_dia p where p.cuenta = d.cuenta and p.fecha = d.fecha)), 0) as tiktok,
      coalesce((select sum(p.pedidos) from public.v_pedidos_dia p where p.cuenta = per.cuenta and p.fecha between per.desde and p_dia), 0) as pedidos,
      coalesce((select sum(d.monto_cop) from public.app_publicidad_diaria d where d.cuenta = per.cuenta and d.fecha between per.desde and p_dia), 0) as gasto_total,
      coalesce((select sum(d.monto_cop) from public.app_publicidad_diaria d where d.cuenta = per.cuenta and d.fecha between per.desde and p_dia
                and d.cuenta_ads like 'TikTok · %'), 0) as tiktok_total
    from per
  )
  select coalesce(jsonb_agg(fila order by cuenta), '[]'::jsonb) from (
    select cuenta, jsonb_build_object('cuenta', cuenta,
      'dia', jsonb_build_object('gasto', round(max(gasto_total) filter (where clave = 'dia')), 'tiktok', round(max(tiktok_total) filter (where clave = 'dia')),
                                'pedidos', max(pedidos) filter (where clave = 'dia')),
      'semana', jsonb_build_object('gasto', round(max(gasto) filter (where clave = 'semana')), 'tiktok', round(max(tiktok) filter (where clave = 'semana')),
                                   'pedidos', max(pedidos) filter (where clave = 'semana')),
      'mes', jsonb_build_object('gasto', round(max(gasto) filter (where clave = 'mes')), 'tiktok', round(max(tiktok) filter (where clave = 'mes')),
                                'pedidos', max(pedidos) filter (where clave = 'mes'))) as fila
    from g group by cuenta
    having max(gasto_total) > 0 or max(pedidos) > 0
  ) s;
$function$;

-- Cada correo de CPA activo (uno por sociedad) sale una vez al día, desde su hora, cuando están los pedidos de ayer.
create or replace function public.informe_cpa_intentar()
returns text
language plpgsql security definer set search_path to '' as $function$
declare
  v_ahora timestamp := now() at time zone 'America/Bogota';
  v_dia date := (now() at time zone 'America/Bogota')::date - 1;
  r record; v_faltan text[]; v_out text[] := '{}';
begin
  for r in select * from public.informe_programado where tipo = 'cpa' and activo order by id loop
    if extract(hour from v_ahora) < r.desde_hora then v_out := v_out || (r.id || ': antes de las ' || r.desde_hora); continue; end if;
    if r.ultimo_dia >= v_dia then v_out := v_out || (r.id || ': ya salió el de ' || v_dia); continue; end if;
    v_faltan := public.informe_cpa_faltan(v_dia, r.sociedad);
    if cardinality(v_faltan) > 0 then v_out := v_out || (r.id || ': faltan ' || array_to_string(v_faltan, ', ')); continue; end if;
    update public.informe_programado set ultimo_dia = v_dia where id = r.id and (ultimo_dia is null or ultimo_dia < v_dia);
    if not found then continue; end if;
    perform public.informe_programado_enviar(r.id);
    v_out := v_out || (r.id || ': enviado el de ' || v_dia);
  end loop;
  return coalesce(nullif(array_to_string(v_out, ' · '), ''), 'sin correo de CPA activo');
end $function$;

-- Aviso de que faltan los pedidos de ayer, por sociedad (Joalix a las 7 a. m., A un clic a las 8:01 a. m.).
drop function if exists public.informe_cpa_recordar();
create or replace function public.informe_cpa_recordar(p_sociedad text default 'Joalix AA Group')
returns text
language plpgsql security definer set search_path to '' as $function$
declare
  v_dia date := (now() at time zone 'America/Bogota')::date - 1;
  r record; v_faltan text[];
begin
  select * into r from public.informe_programado where tipo = 'cpa_falta' and activo and sociedad = p_sociedad limit 1;
  if not found then return 'sin aviso activo para ' || p_sociedad; end if;
  if exists (select 1 from public.informe_programado where tipo = 'cpa' and activo and sociedad = p_sociedad and ultimo_dia >= v_dia) then
    return 'el CPA de ' || v_dia || ' ya salió';
  end if;
  v_faltan := public.informe_cpa_faltan(v_dia, p_sociedad);
  if cardinality(v_faltan) = 0 then return 'no falta nada de ' || v_dia; end if;
  perform public.informe_programado_enviar(r.id);
  return 'aviso enviado: faltan ' || array_to_string(v_faltan, ', ');
end $function$;
revoke all on function public.informe_cpa_recordar(text) from public, anon, authenticated;

-- Correos de A un clic: por ahora solo al dueño y apagados hasta desplegar el correo nuevo y confirmar destinatarios.
insert into public.informe_programado (id, activo, destinatarios, sociedad, dias_atras, asunto, tipo, desde_hora)
select 'aunclic_cpa', false, array[u.email], 'A un clic', 1, 'A UN CLIC · CPA REAL Y PUBLICIDAD DEL DÍA', 'cpa', 8
from public.app_usuarios u where u.rol = 'owner' limit 1
on conflict (id) do nothing;
insert into public.informe_programado (id, activo, destinatarios, sociedad, dias_atras, asunto, tipo, desde_hora)
select 'aunclic_cpa_falta', false, array[u.email], 'A un clic', 1, '⏰ A un clic · Aún no están las ventas de ayer', 'cpa_falta', 8
from public.app_usuarios u where u.rol = 'owner' limit 1
on conflict (id) do nothing;

-- El correo sale al minuto de quedar completos los pedidos (además del disparo inmediato al guardarlos).
select cron.alter_job((select jobid from cron.job where jobname = 'informe-cpa-revisar'), schedule := '* * * * *');
select cron.schedule('informe-cpa-recordar-aunclic', '1 13 * * *', $$select public.informe_cpa_recordar('A un clic')$$);
