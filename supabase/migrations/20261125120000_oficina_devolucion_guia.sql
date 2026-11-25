-- Disp. en oficina (pedido de la encargada de Ecuador, 25-nov-2026): observación nueva «Devolución de guía» para las
-- guías que pasaron los 7 días en oficina sin respuesta del cliente. Esas guías, y las de «ya no desea el producto», salen
-- de la lista de llamadas (quedan en su propio filtro) y no cuentan en el número rojo del menú.
-- Por qué 7 días: de 100 guías que llegan a oficina en Ecuador, 70 se entregan en los días 0 a 7 y solo 4 más después.

alter table public.oficina_observaciones drop constraint oficina_observaciones_codigo_check;
alter table public.oficina_observaciones add constraint oficina_observaciones_codigo_check check (codigo in (
  'retira_fecha', 'seguimiento', 'ya_retiro', 'sin_respuesta', 'colgo', 'no_desea', 'no_puede_ahora',
  'numero_incorrecto', 'numero_ajeno', 'numero_no_disponible', 'otro', 'devolucion'));

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
    and not coalesce(ob.codigo = 'ya_retiro' and ob.actualizado_en > now() - interval '7 days', false)
    and not coalesce(ob.codigo in ('devolucion', 'no_desea'), false);
$function$;
