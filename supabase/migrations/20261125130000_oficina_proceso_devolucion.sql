-- Disp. en oficina (pedido del dueño, 25-nov-2026): con 9 días o más en oficina la guía pasa sola a «En proceso de
-- devolución» y ya no se llama ni cuenta en el número rojo del menú. Después del día 9 casi no se entrega: de las que
-- siguen en oficina ese día se entrega el 8 % en Ecuador y el 12 % en Colombia (guías desde ago-2026).
-- Llegada = primera vez en «Disponible para retiro en oficina» (igual que oficina_lista); en Others, el último movimiento.

create or replace function public.oficina_pendientes_menu()
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
 set "TimeZone" to 'UTC'
as $function$
  with t as (
    select a.slug, coalesce(a.tz_offset_min, -300) as tz, (now() + make_interval(mins => coalesce(a.tz_offset_min, -300)))::date as hoy
    from public.effi_accounts a where a.slug = any (public.app_cuentas_visibles('oficina'))
  ),
  en_oficina as (
    select 'effi' as origen, t.slug, t.tz, t.hoy, v.guia,
      coalesce((select min(e.fecha_hist_est) from public.effi_guia_estados e
                where e.cuenta = v.cuenta and e.empresa = v.empresa and e.sucursal = v.sucursal and e.id_guia = v.id
                  and e.est_guia_new_efficommerce = 9), v.ultimo_cambio_estado) as llegada
    from t join public.v_guias v on v.cuenta = t.slug
    where v.est_guia_efficommerce = 9 and v.fecha_recaudo is null and v.fecha_anular is null and v.vigente is not false
    union all
    select 'others', t.slug, t.tz, t.hoy, o.guia, coalesce(o.fecha_ultimo_movimiento, o.fecha)::timestamptz + interval '12 hours'
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
    and not coalesce(ob.codigo = 'ya_retiro' and ob.actualizado_en > now() - interval '7 days', false)
    and not coalesce(ob.codigo in ('devolucion', 'no_desea'), false)
    and not coalesce(e.llegada <= now() - interval '9 days', false);
$function$;
