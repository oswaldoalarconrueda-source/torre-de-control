-- 🎬 Modo demostración (pedido del dueño, 17-nov-2026): una versión del Centro de Control solo para el dueño, de solo lectura
-- y con los datos de septiembre de 2026, para mostrar en pantalla cómo se trabaja. Estas funciones solo responden al dueño.

-- Novedades: la misma bandeja, pero con las novedades que llegaron en un rango de fechas (en vivo solo salen las abiertas).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.novedades_bandeja(text[])'::regprocedure);
  d := replace(d, 'public.novedades_bandeja(p_cuentas text[] DEFAULT NULL::text[])',
    'public.novedades_bandeja_demo(p_cuentas text[] DEFAULT NULL::text[], p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)');
  d := replace(d, 'where a.tipo = ''tienda'' and a.activa', 'where a.tipo = ''tienda'' and a.activa and public.app_es_owner()');
  d := replace(d, 'where e.creado_en >= now() - interval ''10 days''', 'where true');
  d := replace(d, 'and not public.novedad_en_devolucion(n)', '');
  d := replace(d, 'and (n.est_novedad = 1 or (env.id is not null and env.creado_en >= c.inicio))',
    'and ((n.fecha_trans + make_interval(mins => c.tz_offset_min))::date between p_desde and p_hasta)');
  -- Un mes de Ecuador son ~7.000 novedades: a la pantalla van las 1.500 más recientes del rango.
  d := replace(d, E'  from n\n  left join public.effi_guias g', E'  from (select * from n order by n.fecha_trans desc limit 1500) n\n  left join public.effi_guias g');
  if position('novedades_bandeja_demo' in d) = 0 or position('between p_desde and p_hasta' in d) = 0 or position('app_es_owner' in d) = 0 or position('limit 1500' in d) = 0 then
    raise exception 'novedades_bandeja cambió';
  end if;
  execute d;
end $$;
revoke all on function public.novedades_bandeja_demo(text[], date, date) from public, anon;
grant execute on function public.novedades_bandeja_demo(text[], date, date) to authenticated;

-- Correo del CPA real (pauta) de un día: las mismas cifras que el correo de las 5 a. m.
create or replace function public.demo_informe_cpa(p_dia date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.app_es_owner() then to_jsonb(public.informe_cpa(p_dia, 'Joalix AA Group')) else '[]'::jsonb end;
$$;
revoke all on function public.demo_informe_cpa(date) from public, anon;
grant execute on function public.demo_informe_cpa(date) to authenticated;

-- Correo de guías pendientes por despacho de un día: las guías que a las 8 a. m. de ese día (hora Colombia) seguían en
-- Generada, creadas hasta el corte (dos días atrás sin contar el domingo). Se reconstruye con el historial de estados.
create or replace function public.demo_pendientes_despacho(p_cuenta text, p_hoy date, p_corte date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with a as (select slug, tz_offset_min from public.effi_accounts where slug = p_cuenta and public.app_es_owner()),
  t as (select ((p_hoy::timestamp + interval '13 hours') at time zone 'UTC') as ts),
  g as (
    select g.*, (g.fecha_trans + make_interval(mins => a.tz_offset_min))::date as dia
    from public.effi_guias g join a on a.slug = g.cuenta
    where g.fecha_trans < ((p_corte + 1)::timestamp - make_interval(mins => a.tz_offset_min)) at time zone 'UTC'
      and g.fecha_trans >= ((p_corte - 20)::timestamp) at time zone 'UTC'
      and (g.fecha_anular is null or g.fecha_anular > (select ts from t))
  )
  select coalesce(jsonb_agg(jsonb_build_object('dia', g.dia, 'proveedor', coalesce(nullif(trim(g.nombre_empresa_proveedor), ''), 'Sin proveedor'),
      'transportadora', split_part(coalesce(g.nombre_transportadora_efficommerce, g.nombre_transportadora, ''), '|', 1),
      'guia', g.guia, 'producto', regexp_replace(trim(coalesce(g.contenido, '')), '\.$', ''), 'valor', g.valor_recaudo)
    order by g.dia, g.nombre_empresa_proveedor), '[]'::jsonb)
  from g
  where coalesce((select h.est_guia_new_efficommerce from public.effi_guia_estados h
      where h.cuenta = g.cuenta and h.empresa = g.empresa and h.sucursal = g.sucursal and h.id_guia = g.id
        and h.fecha_hist_est <= (select ts from t)
      order by h.fecha_hist_est desc limit 1), 1) = 1;
$$;
revoke all on function public.demo_pendientes_despacho(text, date, date) from public, anon;
grant execute on function public.demo_pendientes_despacho(text, date, date) to authenticated;
