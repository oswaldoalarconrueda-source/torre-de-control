-- Números del menú lateral (pedido del dueño, 24-nov-2026): al lado de «Disp. en oficina Effi» y de «Disp. en oficina (Others)»,
-- cuántas guías o pedidos en oficina falta gestionar hoy, sumando las tiendas que la persona ve. Pendiente = sigue en oficina
-- y no tiene llamada hoy, salvo compromiso de retiro para un día que no ha llegado o «ya retiró» hace 7 días o menos.
create or replace function public.oficina_pendientes_menu()
returns jsonb
language sql stable security definer set search_path to '' set "TimeZone" to 'UTC' as $function$
  with t as (
    select a.slug, coalesce(a.tz_offset_min, -300) as tz, (now() + make_interval(mins => coalesce(a.tz_offset_min, -300)))::date as hoy
    from public.effi_accounts a where a.slug = any (public.app_cuentas_visibles('oficina'))
  ),
  en_oficina as (
    select 'effi' as origen, t.slug, t.tz, t.hoy, v.guia
    from t join public.v_guias v on v.cuenta = t.slug
    where v.est_guia_efficommerce = 9 and v.fecha_recaudo is null and v.fecha_anular is null and v.vigente is not false
    union all
    select 'others', t.slug, t.tz, t.hoy, o.guia
    from t join public.dropi_ordenes o on o.cuenta = t.slug
    where o.estatus = 'RECLAME EN OFICINA' and nullif(btrim(o.guia), '') is not null
  )
  select jsonb_build_object(
    'effi', count(*) filter (where e.origen = 'effi'),
    'others', count(*) filter (where e.origen = 'others'))
  from en_oficina e
  left join public.oficina_observaciones ob on ob.cuenta = e.slug and ob.guia = e.guia
  where not exists (select 1 from public.oficina_llamadas l where l.cuenta = e.slug and l.guia = e.guia
                    and (l.creado_en + make_interval(mins => e.tz))::date = e.hoy)
    and not coalesce(ob.codigo = 'retira_fecha' and ob.fecha_compromiso > e.hoy, false)
    and not coalesce(ob.codigo = 'ya_retiro' and ob.actualizado_en > now() - interval '7 days', false);
$function$;
revoke all on function public.oficina_pendientes_menu() from public, anon;
grant execute on function public.oficina_pendientes_menu() to authenticated;
