-- Alerta de huella (30-oct): cada guía nueva de una tienda de Guatemala (la haga el agente o una persona a mano en
-- Effi) sale con el historial de su cliente: pedidos anteriores, entregas, devoluciones, en camino y efectividad.
-- Historial = matriz (Excel hasta agosto 2026) + guías de todas las tiendas del país desde el 1-sep, sin contar la
-- guía misma. Solo las cuentas que el usuario ve; el teléfono sale tapado (últimos 4 dígitos).
create or replace function public.huella_guias(p_desde timestamptz, p_cuenta text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with vis as (select unnest(public.app_cuentas_visibles(null)) as slug),
  r as (
    select g.cuenta, g.id, g.guia, g.fecha_trans, g.nombre_destinatario as cliente, g.nombre_ciudad_destinatario as ciudad,
      g.valor_recaudo, a.pais, right(regexp_replace(coalesce(g.telefonos_destinatario, ''), '\D', '', 'g'), 8) as tel
    from public.effi_guias g join public.effi_accounts a on a.slug = g.cuenta
    where a.tipo = 'tienda' and a.pais = 'GT' and g.cuenta in (select slug from vis) and (p_cuenta is null or g.cuenta = p_cuenta)
      and g.fecha_trans >= greatest(p_desde, now() - interval '7 days') and g.vigente is not false
    order by g.fecha_trans desc
    limit 500
  ),
  -- Guías de las tiendas del país desde septiembre, una fila por teléfono escrito (el primero y el último del campo).
  xs as (
    select distinct x.cuenta, x.id, x.est_guia_efficommerce as est, x.vigente, t.tel
    from public.effi_guias x join public.effi_accounts xa on xa.slug = x.cuenta,
      lateral unnest(array[left(regexp_replace(coalesce(x.telefonos_destinatario, ''), '\D', '', 'g'), 8),
                           right(regexp_replace(coalesce(x.telefonos_destinatario, ''), '\D', '', 'g'), 8)]) as t(tel)
    where xa.tipo = 'tienda' and xa.pais = 'GT' and x.fecha_trans >= '2026-09-01' and length(t.tel) = 8
      and t.tel in (select tel from r)
  ),
  h as (
    select r.cuenta, r.id,
      count(*) filter (where xs.est = 4) as ent,
      count(*) filter (where xs.est = 5) as dev,
      count(*) filter (where xs.est not in (4, 5) and xs.vigente is not false) as curso
    from r join xs on xs.tel = r.tel and not (xs.cuenta = r.cuenta and xs.id = r.id)
    group by 1, 2
  ),
  f as (
    select r.*, coalesce(m.entregadas, 0) + coalesce(h.ent, 0) as ent, coalesce(m.devoluciones, 0) + coalesce(h.dev, 0) as dev,
      coalesce(h.curso, 0) as curso, m.total is not null as en_matriz,
      exists (select 1 from public.auto_eventos e where e.cuenta = r.cuenta and e.paso = 'guia' and e.ok
              and e.mensaje like 'Guía ' || r.guia || ' creada%') as agente
    from r
    left join public.huella_matriz m on m.pais = r.pais and m.telefono = r.tel
    left join h on h.cuenta = r.cuenta and h.id = r.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cuenta', cuenta, 'id', id, 'guia', guia, 'fecha', fecha_trans, 'cliente', cliente, 'ciudad', ciudad,
    'recaudo', valor_recaudo, 'tel', case when length(tel) = 8 then '•••• ' || right(tel, 4) end,
    'hecha_por', case when agente then 'agente' else 'persona' end,
    'pedidos', ent + dev + curso, 'entregas', ent, 'devueltos', dev, 'en_camino', curso, 'en_matriz', en_matriz,
    'efectividad', case when ent + dev > 0 then round(100.0 * ent / (ent + dev)) end
  ) order by fecha_trans desc), '[]'::jsonb)
  from f;
$$;
revoke all on function public.huella_guias(timestamptz, text) from public, anon;
grant execute on function public.huella_guias(timestamptz, text) to authenticated;
