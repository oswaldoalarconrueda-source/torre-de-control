-- 🤖 Agente: "Enviar a modificar dirección" (pedido del dueño, 11-nov-2026). Desde la lista, la orden se manda a la pestaña
-- "Modificar dirección", donde una persona la corrige en Effi. Sale de ahí cuando la dirección se cambia o se le quita la marca.
alter table public.auto_ordenes
  add column if not exists direccion_marcada_en timestamptz,
  add column if not exists direccion_marcada_por text;

create or replace function public.auto_marcar_direccion(p_cuenta text, p_sucursal integer, p_id integer, p_marcar boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare quien text := (select email from auth.users where id = auth.uid());
begin
  if not (public.app_es_owner() or p_cuenta = any (public.app_cuentas_visibles('automatizacion'))) then
    raise exception 'No tienes permiso en este país'; end if;
  update public.auto_ordenes
  set direccion_marcada_en = case when p_marcar then now() end, direccion_marcada_por = case when p_marcar then quien end
  where cuenta = p_cuenta and sucursal = p_sucursal and id = p_id;
  if not found then raise exception 'No encuentro la orden'; end if;
  perform public.auto_evento(p_cuenta, p_sucursal, p_id, 'inicio', null,
    case when p_marcar then 'Enviada a modificar dirección por ' else 'Quitada de modificar dirección por ' end || coalesce(quien, 'el dueño'));
end $$;
revoke all on function public.auto_marcar_direccion(text, integer, integer, boolean) from public, anon;
grant execute on function public.auto_marcar_direccion(text, integer, integer, boolean) to authenticated;

-- Al cambiarse la dirección en Effi, la orden sale de la pestaña.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.auto_accion_resultado'::regproc);
  if position('direccion_marcada_en' in d) = 0 then
    d := replace(d, 'plan = null, plan_estado = null, plan_motivo = null, plan_en = null, decision = null, actualizado_en = now()',
      'plan = null, plan_estado = null, plan_motivo = null, plan_en = null, decision = null, direccion_marcada_en = null, direccion_marcada_por = null, actualizado_en = now()');
    execute d;
  end if;
  d := pg_get_functiondef('public.auto_lista'::regproc);
  if position('''direccion_marcada''' in d) = 0 then
    d := replace(d, '''tiene_ubicacion'', ciudad_id is not null,',
      '''tiene_ubicacion'', ciudad_id is not null, ''direccion_marcada'', direccion_marcada_en, ''direccion_marcada_por'', direccion_marcada_por,');
    execute d;
  end if;
end $$;
