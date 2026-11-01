-- Resumen de la pantalla de inicio del Centro de Control: por cada tienda que el usuario ve, lo de hoy, lo que va del mes y
-- lo pendiente en este momento. Cada dato solo llega si el usuario tiene el módulo en esa cuenta (app_cuentas_visibles);
-- el CPA solo le llega al dueño y a los socios. Los pedidos y el % de entrega del mes salen de kpi_diario_dim (los mismos de
-- Data Experience en "Ambas"). "Volver a llamar" usa la regla del CRM de oficina: "ya retiró" hace 24 h o más, o una fecha
-- prometida que ya pasó, con la guía todavía en oficina.
create or replace function public.app_inicio()
returns jsonb
language sql stable security definer set search_path to '' set "TimeZone" to 'UTC'
as $$
  with vis as (
    select a.slug, a.sociedad, make_interval(mins => a.tz_offset_min) as off
    from public.effi_accounts a
    where a.tipo = 'tienda' and a.activa and a.slug = any (public.app_cuentas_visibles())
  ),
  perm as (
    select public.app_cuentas_visibles('resumen') as resumen, public.app_cuentas_visibles('oficina') as oficina,
      public.app_cuentas_visibles('novedades') as novedades, public.app_cuentas_visibles('dinero') as dinero,
      public.app_cuentas_visibles('automatizacion') as agente,
      public.app_es_owner() or exists (select 1 from public.app_usuarios u where u.user_id = (select auth.uid()) and u.activo and u.rol = 'socio') as socio
  ),
  -- coalesce a arreglo vacío: con null, informe_diario devolvería todas las tiendas.
  dia as (
    select jsonb_array_elements(public.informe_diario(0, coalesce((select array_agg(slug) from vis), '{}'::text[]))) as f
  ),
  d as (
    select v.slug, v.sociedad, v.off, x.f, (x.f->>'dia')::date as hoy, date_trunc('month', (x.f->>'dia')::date)::date as mes
    from vis v join dia x on x.f->>'cuenta' = v.slug
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cuenta', d.slug, 'sociedad', d.sociedad, 'dia', d.hoy,
    'ordenes', case when d.slug = any (p.resumen) then (d.f->>'ordenes')::bigint end,
    'guias', case when d.slug = any (p.resumen) then (d.f->>'guias')::bigint end,
    'entregadas', case when d.slug = any (p.resumen) then (d.f->>'entregadas')::bigint end,
    'recaudo', case when d.slug = any (p.dinero) then (d.f->>'recaudo')::numeric end,
    'mes_pedidos', case when d.slug = any (p.resumen) then m.pedidos end,
    'mes_entregadas', case when d.slug = any (p.resumen) then m.entregadas end,
    'mes_recaudo', case when d.slug = any (p.dinero) then (
      select coalesce(sum(w.valor), 0) from public.effi_wallet w
      where w.cuenta = d.slug and w.t_movimiento = 1 and w.vigente is not false
        and w.fecha_trans >= (d.mes::timestamp - d.off)::timestamptz) end,
    'mes_gasto', case when p.socio then c.gasto end,
    'mes_pedidos_lucid', case when p.socio then c.pedidos end,
    'en_oficina', case when d.slug = any (p.oficina) then o.en_oficina end,
    'volver', case when d.slug = any (p.oficina) then o.volver end,
    'novedades', case when d.slug = any (p.novedades) then (d.f->>'novedades_abiertas')::bigint end,
    'errores', case when d.slug = any (p.agente) then (d.f->>'errores_agente')::bigint end
  ) order by d.slug), '[]'::jsonb)
  from d cross join perm p
  cross join lateral (
    select coalesce(sum(k.guias), 0)::bigint as pedidos, coalesce(sum(k.guias) filter (where k.estado_u = 'ENTREGADO'), 0)::bigint as entregadas
    from public.kpi_diario_dim(array[d.slug], d.mes, d.hoy, null, null, null, 'ambas') k
  ) m
  cross join lateral (
    select coalesce(sum(x.pedidos), 0)::bigint as pedidos,
      coalesce((select sum(g.monto_cop) from public.app_publicidad_diaria g
                where g.cuenta = d.slug and g.fecha between d.mes and d.hoy
                  and exists (select 1 from public.app_pedidos_diarios y where y.cuenta = g.cuenta and y.fecha = g.fecha)), 0) as gasto
    from public.app_pedidos_diarios x where x.cuenta = d.slug and x.fecha between d.mes and d.hoy
  ) c
  cross join lateral (
    select count(*) as en_oficina,
      count(*) filter (where (ob.codigo = 'ya_retiro' and ob.actualizado_en <= now() - interval '24 hours')
        or (ob.codigo = 'retira_fecha' and ob.fecha_compromiso < d.hoy)) as volver
    from public.effi_guias g
    left join public.oficina_observaciones ob on ob.cuenta = g.cuenta and ob.guia = g.guia
    where g.cuenta = d.slug and g.est_guia_efficommerce = 9 and g.fecha_recaudo is null and g.fecha_anular is null and g.vigente is not false
  ) o;
$$;

revoke all on function public.app_inicio() from public, anon;
grant execute on function public.app_inicio() to authenticated, service_role;
