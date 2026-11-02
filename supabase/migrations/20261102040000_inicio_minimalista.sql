-- Inicio minimalista: por país, órdenes, remisiones y guías de hoy con su valor, relación de despacho y cómo va el mes.
-- Para el dueño y los socios, el rendimiento del equipo de hoy y quién está en línea (latido cada minuto desde la pantalla).
-- Se crean aparte de app_inicio porque la versión publicada todavía la usa; app_inicio se borra después de publicar.

alter table public.app_usuarios add column if not exists ultimo_visto timestamptz;

-- Latido: lo llama cada pantalla abierta. Escribe máximo una vez cada 30 segundos por usuario.
create or replace function public.app_latido()
returns void
language sql security definer set search_path to ''
as $$
  update public.app_usuarios set ultimo_visto = now()
  where user_id = (select auth.uid()) and (ultimo_visto is null or ultimo_visto < now() - interval '30 seconds');
$$;

-- Conteos: con resumen, guías (En vivo) o agente. Dinero: solo con resumen.
-- Órdenes como en el agente (auto_fabrica): sin las anuladas que no llegaron a remisión. Remisiones: las de orden más las
-- directas sin orden (Lucid en A un clic), que se ven por su guía. Despacho: de lo de hoy, cuánto ya tiene guía.
-- El mes sale de kpi_despacho y kpi_diario_dim en "Ambas": las mismas cifras de Data Experience.
create or replace function public.app_inicio_paises()
returns jsonb
language sql stable security definer set search_path to '' set "TimeZone" to 'UTC'
as $$
  with perm as (
    select public.app_cuentas_visibles('resumen') as resumen,
      public.app_cuentas_visibles('resumen') || public.app_cuentas_visibles('guias') || public.app_cuentas_visibles('automatizacion') as conteo
  ),
  vis as (
    select a.slug, x.hoy, date_trunc('month', x.hoy)::date as mes,
      (x.hoy::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz as ini
    from public.effi_accounts a
    cross join lateral (select (now() + make_interval(mins => a.tz_offset_min))::date as hoy) x
    where a.tipo = 'tienda' and a.activa and a.slug = any ((select conteo from perm)::text[])
      and exists (select 1 from public.effi_guias g where g.cuenta = a.slug and g.fecha_trans > now() - interval '30 days')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cuenta', v.slug, 'dia', v.hoy,
    'ordenes', o.n, 'ordenes_valor', case when ve then o.valor end,
    'remisiones', r.n + d.n, 'remisiones_valor', case when ve then r.valor + d.valor end,
    'guias', g.n, 'guias_valor', case when ve then g.valor end,
    'despacho_con_guia', o.con_guia + d.n, 'despacho_total', o.n + d.n,
    'mes_guias', (k->'despachado'->>'n')::bigint, 'mes_entregadas', (k->'entregado'->>'n')::bigint,
    'mes_valor', case when ve then (k->'despachado'->>'venta')::numeric end,
    'serie', s.actual, 'serie_ant', s.anterior
  ) order by v.slug), '[]'::jsonb)
  from vis v
  cross join perm p
  cross join lateral (select v.slug = any (p.resumen) as ve) w(ve)
  cross join lateral (
    select count(*) as n, coalesce(sum(x.total), 0) as valor, count(*) filter (where x.guia is not null) as con_guia
    from public.auto_ordenes x
    where x.cuenta = v.slug and x.fecha_orden >= v.ini and not (x.orden_vigente is false and x.id_remision is null)
  ) o
  cross join lateral (
    select count(*) as n, coalesce(sum(x.total), 0) as valor
    from public.auto_ordenes x
    where x.cuenta = v.slug and x.rem_fecha >= v.ini and x.rem_vigente is not false
  ) r
  cross join lateral (
    select count(*) as n, coalesce(sum(g.valor_recaudo), 0) as valor
    from public.effi_guias g
    where g.cuenta = v.slug and g.t_trans_ref = 4 and g.vigente is not false and g.fecha_trans >= v.ini
      and not exists (select 1 from public.auto_ordenes x where x.cuenta = g.cuenta and x.id_remision = g.id_ref)
  ) d
  cross join lateral (
    select count(*) as n, coalesce(sum(coalesce(nullif(g.valor_recaudo, 0), g.valor_declarado, 0)), 0) as valor
    from public.effi_guias g
    where g.cuenta = v.slug and g.fecha_trans >= v.ini and g.vigente is not false
  ) g
  cross join lateral (select public.kpi_despacho(v.slug, v.mes, v.hoy, 'ambas') as k) m
  cross join lateral (
    select
      (select coalesce(jsonb_agg(jsonb_build_object('d', extract(day from z.fecha)::int, 'n', z.n) order by z.fecha), '[]'::jsonb)
       from (select t.fecha, sum(t.guias) as n from public.kpi_diario_dim(array[v.slug], v.mes, v.hoy, null, null, null, 'ambas') t group by 1) z) as actual,
      (select coalesce(jsonb_agg(jsonb_build_object('d', extract(day from z.fecha)::int, 'n', z.n) order by z.fecha), '[]'::jsonb)
       from (select t.fecha, sum(t.guias) as n from public.kpi_diario_dim(array[v.slug], (v.mes - interval '1 month')::date, v.mes - 1, null, null, null, 'ambas') t group by 1) z) as anterior
  ) s;
$$;

-- Equipo de hoy (hora Colombia), solo dueño y socios: quiénes trabajan en las cuentas que el usuario ve, si están en línea
-- (latido en los últimos 3 minutos) y lo que han hecho en esas cuentas. Sin el dueño en la lista.
create or replace function public.app_inicio_equipo()
returns jsonb
language sql stable security definer set search_path to '' set "TimeZone" to 'UTC'
as $$
  with permitido as (
    select public.app_es_owner() or exists (select 1 from public.app_usuarios u where u.user_id = (select auth.uid()) and u.activo and u.rol = 'socio') as ok
  ),
  vis as (select a.slug, a.sociedad from public.effi_accounts a where a.slug = any (public.app_cuentas_visibles())),
  ini as (select (((now() - interval '5 hours')::date)::timestamp + interval '5 hours')::timestamptz as t),
  equipo as (
    select u.user_id, u.email, coalesce(nullif(trim(u.nombre), ''), split_part(u.email, '@', 1)) as nombre, u.rol, u.ultimo_visto
    from public.app_usuarios u
    where (select ok from permitido) and u.activo and u.rol in ('socio', 'empleado', 'proveedor')
      and (u.sociedades && (select array_agg(sociedad) from vis)
        or exists (select 1 from public.app_permisos p where p.user_id = u.user_id and p.cuenta in (select slug from vis)))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'nombre', e.nombre, 'rol', e.rol, 'en_linea', coalesce(e.ultimo_visto > now() - interval '3 minutes', false),
    'visto', greatest(e.ultimo_visto, a.last_sign_in_at),
    'llamadas', c.oficina + c.novedad, 'gestiones', c.gestiones, 'soluciones', c.soluciones
  ) order by coalesce(e.ultimo_visto > now() - interval '3 minutes', false) desc, c.oficina + c.novedad + c.gestiones + c.soluciones desc, e.nombre), '[]'::jsonb)
  from equipo e
  left join auth.users a on a.id = e.user_id
  cross join lateral (
    select
      (select count(*) from public.oficina_llamadas l where l.usuario_email = e.email and l.creado_en >= (select t from ini) and l.cuenta in (select slug from vis)) as oficina,
      (select count(*) from public.novedad_llamadas l where l.usuario_email = e.email and l.creado_en >= (select t from ini) and l.cuenta in (select slug from vis)) as novedad,
      (select count(*) from public.oficina_observaciones o where o.usuario_email = e.email and o.codigo is not null and o.actualizado_en >= (select t from ini) and o.cuenta in (select slug from vis)) as gestiones,
      (select count(*) from public.novedad_envios x where x.usuario_email = e.email and x.estado = 'enviada' and x.enviado_en >= (select t from ini) and x.cuenta in (select slug from vis)) as soluciones
  ) c;
$$;

revoke all on function public.app_latido() from public, anon;
revoke all on function public.app_inicio_paises() from public, anon;
revoke all on function public.app_inicio_equipo() from public, anon;
grant execute on function public.app_latido() to authenticated, service_role;
grant execute on function public.app_inicio_paises() to authenticated, service_role;
grant execute on function public.app_inicio_equipo() to authenticated, service_role;
