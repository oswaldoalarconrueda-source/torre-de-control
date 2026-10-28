-- 📝 Pedidos Lucid: la persona encargada llena en la Torre los pedidos de cada día por país (el número de LucidSales).
-- Es un módulo exclusivo ("pedidos_lucid"): solo lo tienen el dueño y a quien se le marque en /usuarios, ni siquiera los
-- socios. Puede corregir los últimos 7 días; lo anterior ya no cambia (el dueño sí puede).
alter table public.app_pedidos_diarios add column if not exists actualizado_por text;

create or replace function public.pedidos_lucid_guardar(p_cuenta text, p_fecha date, p_pedidos integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if not (public.app_es_owner() or exists (
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
end $$;
revoke all on function public.pedidos_lucid_guardar(text, date, integer) from public, anon;
grant execute on function public.pedidos_lucid_guardar(text, date, integer) to authenticated;
