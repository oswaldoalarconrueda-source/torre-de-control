-- Número rojo del menú al lado de «Campañas sin identificar» (pedido del dueño, 24-nov-2026): campañas con gasto desde el
-- inicio del negocio (1-jul-2026, igual que la pantalla) que no tienen producto (ni asignado a mano ni por regla), sumando
-- las tiendas que la persona ve con el permiso de Productos o el de Campañas.
create or replace function public.prod_campanas_sin_identificar()
returns integer
language sql stable security definer set search_path to '' as $function$
  with t as (
    select unnest(public.app_cuentas_visibles('resumen')) as cuenta
    union select unnest(public.app_cuentas_visibles('campanas'))
  ),
  c as (
    select distinct p.cuenta, p.campana
    from public.app_publicidad_campanas p join t on t.cuenta = p.cuenta
    where p.fecha >= date '2026-07-01' and p.monto_cop > 0
  )
  select count(*)::int from c
  where not exists (select 1 from public.prod_campana_asignada a where a.cuenta = c.cuenta and a.campana = c.campana)
    and not exists (select 1 from public.prod_campana_reglas r
                    where (r.cuenta is null or r.cuenta = c.cuenta) and public.prod_clave(c.campana) ~ r.patron);
$function$;
revoke all on function public.prod_campanas_sin_identificar() from public, anon;
grant execute on function public.prod_campanas_sin_identificar() to authenticated;
