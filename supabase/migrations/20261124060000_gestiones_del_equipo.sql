-- «Gestiones del equipo» (pedido del dueño, 24-nov-2026, para la encargada de novedades y oficina): quien tenga este módulo
-- en una tienda ve y filtra lo que hizo cada usuario en Novedades y en Disp. en oficina (llamadas, soluciones enviadas y
-- observaciones), como el dueño y los socios. Los demás empleados solo ven sus propias gestiones.

-- ¿Puede ver las gestiones de todo el equipo en esta tienda? Dueño, socios de la sociedad o empleado con el módulo «equipo».
create or replace function public.app_ve_equipo(p_cuenta text)
returns boolean
language sql stable security definer set search_path to '' as $function$
  select p_cuenta = any (public.app_cuentas_visibles('equipo'));
$function$;
revoke all on function public.app_ve_equipo(text) from public, anon;
grant execute on function public.app_ve_equipo(text) to authenticated;

-- Medidores de novedades: por asesora solo salen todas si la persona ve el equipo de esa tienda; si no, solo su fila.
create or replace function public.novedades_medidores(p_cuentas text[] DEFAULT NULL::text[], p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_todas boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
  with c as (
    select a.slug,
      ((coalesce(p_desde, (now() + make_interval(mins => a.tz_offset_min))::date))::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz as desde,
      ((coalesce(p_hasta, p_desde, (now() + make_interval(mins => a.tz_offset_min))::date) + 1)::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz as hasta
    from public.effi_accounts a
    where a.tipo = 'tienda' and a.activa and a.slug = any (public.app_cuentas_visibles('novedades'))
      and (p_cuentas is null or a.slug = any (p_cuentas))
  ),
  eq as (select public.app_cuentas_visibles('equipo') as cuentas, (select email from auth.users where id = (select auth.uid())) as yo),
  lle as (select n.cuenta, count(*) n from public.effi_novedades n join c on c.slug = n.cuenta
          where n.t_novedad = 2 and n.vigente is not false and (p_todas or not public.novedad_ignorada(n)) and n.fecha_trans >= c.desde and n.fecha_trans < c.hasta group by 1),
  pen as (select n.cuenta, count(*) n from public.effi_novedades n join c on c.slug = n.cuenta
          where n.t_novedad = 2 and n.vigente is not false and n.est_novedad = 1 and not public.novedad_en_devolucion(n) and (p_todas or not public.novedad_ignorada(n)) group by 1),
  ll as (select l.* from public.novedad_llamadas l join c on c.slug = l.cuenta where l.creado_en >= c.desde and l.creado_en < c.hasta and not exists (select 1 from public.effi_novedades x where x.cuenta = l.cuenta and x.empresa = l.empresa and x.id = l.novedad and public.novedad_ignorada(x) and not p_todas)),
  sol as (
    select e.cuenta, e.usuario_email, e.enviado_en, n.fecha_trans as llego,
      g.ultimo_cambio_estado > e.enviado_en as cambio, g.est_guia_efficommerce = 4 as entregada
    from public.novedad_envios e
    join c on c.slug = e.cuenta
    join public.effi_novedades n on n.cuenta = e.cuenta and n.empresa = e.empresa and n.id = e.novedad
    left join public.effi_guias g on g.cuenta = n.cuenta and g.empresa = n.empresa and g.sucursal = n.sucursal_guia and g.id = n.id_guia
    where e.estado = 'enviada' and (p_todas or not public.novedad_ignorada(n)) and e.enviado_en >= c.desde and e.enviado_en < c.hasta
  ),
  -- Lo que sale por asesora: todo en las tiendas donde ve el equipo; en las demás, solo lo suyo.
  lla as (select ll.* from ll, eq where ll.cuenta = any (eq.cuentas) or ll.usuario_email = eq.yo),
  sola as (select sol.* from sol, eq where sol.cuenta = any (eq.cuentas) or sol.usuario_email = eq.yo),
  pa as (
    select l.usuario_email, count(distinct (l.cuenta, l.empresa, l.novedad)) n
    from public.novedad_llamadas l
    join c on c.slug = l.cuenta
    cross join eq
    join public.effi_novedades n on n.cuenta = l.cuenta and n.empresa = l.empresa and n.id = l.novedad and n.est_novedad = 1 and n.vigente is not false and not public.novedad_en_devolucion(n) and (p_todas or not public.novedad_ignorada(n))
    where not exists (select 1 from public.novedad_envios e where e.cuenta = l.cuenta and e.empresa = l.empresa and e.novedad = l.novedad and e.estado <> 'error')
      and (l.cuenta = any (eq.cuentas) or l.usuario_email = eq.yo)
    group by 1
  ),
  quienes as (select usuario_email from lla union select usuario_email from sola union select usuario_email from pa)
  select jsonb_build_object(
    'cuentas', (select coalesce(jsonb_agg(jsonb_build_object(
      'cuenta', c.slug,
      'llegaron', coalesce((select n from lle where lle.cuenta = c.slug), 0),
      'llamadas', (select count(*) from ll where ll.cuenta = c.slug),
      'contactados', (select count(*) from ll where ll.cuenta = c.slug and ll.resultado = 'contesto'),
      'solucionadas', (select count(*) from sol where sol.cuenta = c.slug),
      'cambiaron', (select count(*) from sol where sol.cuenta = c.slug and sol.cambio),
      'entregadas', (select count(*) from sol where sol.cuenta = c.slug and sol.entregada),
      'pendientes', coalesce((select n from pen where pen.cuenta = c.slug), 0),
      'respuesta_min', (select round(avg(extract(epoch from sol.enviado_en - sol.llego) / 60)) from sol where sol.cuenta = c.slug)
    ) order by c.slug), '[]'::jsonb) from c),
    'asesoras', (select coalesce(jsonb_agg(jsonb_build_object(
      'email', q.usuario_email,
      'nombre', coalesce((select u.nombre from public.app_usuarios u where u.email = q.usuario_email), split_part(q.usuario_email, '@', 1)),
      'llamadas', (select count(*) from lla where lla.usuario_email = q.usuario_email),
      'contactados', (select count(*) from lla where lla.usuario_email = q.usuario_email and lla.resultado = 'contesto'),
      'solucionadas', (select count(*) from sola where sola.usuario_email = q.usuario_email),
      'cambiaron', (select count(*) from sola where sola.usuario_email = q.usuario_email and sola.cambio),
      'entregadas', (select count(*) from sola where sola.usuario_email = q.usuario_email and sola.entregada),
      'pendientes', coalesce((select n from pa where pa.usuario_email = q.usuario_email), 0),
      'respuesta_min', (select round(avg(extract(epoch from sola.enviado_en - sola.llego) / 60)) from sola where sola.usuario_email = q.usuario_email)
    ) order by q.usuario_email), '[]'::jsonb) from quienes q where q.usuario_email is not null)
  );
$function$;

-- «Quién hizo qué» de Disp. en oficina (Effi y Others comparten las llamadas por guía): antes solo el dueño. Ahora quien
-- ve el equipo ve a todos; cualquier otro usuario con el módulo de oficina ve solo su propia fila.
create or replace function public.oficina_por_usuario(p_cuenta text, p_dias integer DEFAULT 14, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('oficina')) as ok, public.app_ve_equipo(p_cuenta) as equipo,
                            (select email from auth.users where id = (select auth.uid())) as yo),
  tz as (select make_interval(mins => tz_offset_min) as off from public.effi_accounts where slug = p_cuenta),
  desde as (select ((coalesce(p_desde, (now() + (select off from tz))::date - (greatest(1, least(p_dias, 60)) - 1))::timestamp) - (select off from tz))::timestamptz as t), hasta as (select ((coalesce(p_hasta, (now() + (select off from tz))::date) + 1)::timestamp - (select off from tz))::timestamptz as t),
  hoy as (select (((now() + (select off from tz))::date)::timestamp - (select off from tz))::timestamptz as t),
  ll as (select l.* from public.oficina_llamadas l, permitido p where l.cuenta = p_cuenta and p.ok and (p.equipo or l.usuario_email = p.yo)
           and l.creado_en >= (select t from desde) and l.creado_en < (select t from hasta)),
  ob as (select o.* from public.oficina_observaciones o, permitido p where o.cuenta = p_cuenta and p.ok and (p.equipo or o.usuario_email = p.yo)
           and o.codigo is not null and o.actualizado_en >= (select t from desde) and o.actualizado_en < (select t from hasta)),
  quienes as (select usuario_email from ll union select usuario_email from ob)
  select coalesce(jsonb_agg(jsonb_build_object(
    'email', q.usuario_email,
    'nombre', coalesce((select u.nombre from public.app_usuarios u where u.email = q.usuario_email), split_part(q.usuario_email, '@', 1)),
    'contactos', (select count(*) from ll where ll.usuario_email = q.usuario_email),
    'contactos_hoy', (select count(*) from ll where ll.usuario_email = q.usuario_email and ll.creado_en >= (select t from hoy)),
    'contactados', (select count(*) from ll where ll.usuario_email = q.usuario_email and ll.resultado = 'contesto'),
    'no_contesta', (select count(*) from ll where ll.usuario_email = q.usuario_email and ll.resultado = 'no_contesto'),
    'no_aplica', (select count(*) from ll where ll.usuario_email = q.usuario_email and ll.resultado = 'telefono_malo'),
    'guias', (select count(distinct ll.guia) from ll where ll.usuario_email = q.usuario_email),
    'gestiones', (select count(*) from ob where ob.usuario_email = q.usuario_email),
    'gestiones_hoy', (select count(*) from ob where ob.usuario_email = q.usuario_email and ob.actualizado_en >= (select t from hoy))
  ) order by q.usuario_email), '[]'::jsonb)
  from quienes q where q.usuario_email is not null;
$function$;
