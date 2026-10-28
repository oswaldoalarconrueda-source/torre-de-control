-- Correo "URGENTE · CPA REAL DEL DÍA": sale cuando los pedidos de ayer están completos (pedido del dueño, 28-oct).
-- Desde las 5:00 a. m. Colombia se revisa cada 10 minutos (y también cada vez que alguien guarda en 📝 Pedidos Lucid):
-- si ya están los pedidos de ayer de todos los países que se llevan, se envía; si falta alguno, se espera y sale apenas
-- se llene, a la hora que sea. Una sola vez por día (informe_programado.ultimo_dia).
-- "Países que se llevan" = tiendas de la sociedad con pedidos cargados en los últimos 7 días antes de ayer (así Costa
-- Rica, que no se lleva en Lucid, no frena el correo).
alter table public.informe_programado add column if not exists ultimo_dia date;

create or replace function public.informe_cpa_faltan(p_dia date, p_sociedad text)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(t.slug order by t.slug), '{}') from (
    select distinct p.cuenta as slug from public.app_pedidos_diarios p join public.effi_accounts a on a.slug = p.cuenta
    where a.sociedad = p_sociedad and p.fecha between p_dia - 7 and p_dia - 1
  ) t
  where not exists (select 1 from public.app_pedidos_diarios x where x.cuenta = t.slug and x.fecha = p_dia);
$$;
revoke all on function public.informe_cpa_faltan(date, text) from public, anon, authenticated;

create or replace function public.informe_cpa_intentar()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_ahora timestamp := now() at time zone 'America/Bogota';
  v_dia date := (now() at time zone 'America/Bogota')::date - 1;
  r record; v_faltan text[];
begin
  if extract(hour from v_ahora) < 5 then return 'antes de las 5 a. m.'; end if;
  select * into r from public.informe_programado where tipo = 'cpa' and activo limit 1;
  if not found then return 'sin correo de CPA activo'; end if;
  if r.ultimo_dia >= v_dia then return 'ya se envió el de ' || v_dia; end if;
  v_faltan := public.informe_cpa_faltan(v_dia, r.sociedad);
  if cardinality(v_faltan) > 0 then return 'faltan pedidos de ' || array_to_string(v_faltan, ', '); end if;
  -- Se marca antes de enviar: si dos revisiones coinciden, solo una lo manda.
  update public.informe_programado set ultimo_dia = v_dia where id = r.id and (ultimo_dia is null or ultimo_dia < v_dia);
  if not found then return 'ya se envió el de ' || v_dia; end if;
  perform public.informe_programado_enviar(r.id);
  return 'enviado el de ' || v_dia;
end $$;
revoke all on function public.informe_cpa_intentar() from public, anon, authenticated;

-- El envío fijo de las 5 a. m. se cambia por la revisión cada 10 minutos.
select cron.unschedule('informe-cpa-5am') where exists (select 1 from cron.job where jobname = 'informe-cpa-5am');
select cron.schedule('informe-cpa-revisar', '*/10 * * * *', $$ select public.informe_cpa_intentar(); $$);

-- Pedidos Lucid: al guardar, se intenta el correo de CPA (sale apenas los pedidos de ayer quedan completos).
create or replace function public.pedidos_lucid_guardar(p_cuenta text, p_fecha date, p_pedidos integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if not (public.app_es_owner()
    or exists (
      select 1 from public.app_usuarios u join public.effi_accounts a on a.slug = p_cuenta
      where u.user_id = (select auth.uid()) and u.activo and u.rol = 'socio' and a.sociedad = any (u.sociedades))
    or exists (
      select 1 from public.app_permisos p join public.app_usuarios u using (user_id)
      where p.user_id = (select auth.uid()) and p.cuenta = p_cuenta and u.activo and u.rol = 'empleado'
        and 'pedidos_lucid' = any (p.modulos))) then
    raise exception 'No tienes permiso para llenar los pedidos de esta tienda';
  end if;
  if p_fecha > v_hoy then raise exception 'No se pueden llenar días que todavía no pasan'; end if;
  if not public.app_es_owner() and p_fecha < v_hoy - 7 then
    raise exception 'Solo se pueden corregir los últimos 7 días; para antes, pídeselo al dueño';
  end if;
  if p_pedidos is null then
    delete from public.app_pedidos_diarios where cuenta = p_cuenta and fecha = p_fecha;
    return;
  end if;
  if p_pedidos < 0 then raise exception 'El número de pedidos no puede ser negativo'; end if;
  insert into public.app_pedidos_diarios (cuenta, fecha, pedidos, fuente, actualizado_en, actualizado_por)
  values (p_cuenta, p_fecha, p_pedidos, 'Torre · Pedidos Lucid', now(), (select email from auth.users where id = auth.uid()))
  on conflict (cuenta, fecha) do update set pedidos = excluded.pedidos, fuente = excluded.fuente,
    actualizado_en = excluded.actualizado_en, actualizado_por = excluded.actualizado_por;
  -- Si con esto quedaron completos los pedidos de ayer, sale de una vez el correo de CPA (si ya pasaron las 5 a. m.).
  -- Un fallo del correo nunca impide guardar.
  begin perform public.informe_cpa_intentar(); exception when others then null; end;
end $$;
