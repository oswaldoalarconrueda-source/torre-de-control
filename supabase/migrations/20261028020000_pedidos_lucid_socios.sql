-- 📝 Pedidos Lucid: los socios también llenan los pedidos de las tiendas de su sociedad (pedido del dueño, 28-oct), con
-- la misma regla que la empleada: solo los últimos 7 días. El dueño puede corregir cualquier día.
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
end $$;
