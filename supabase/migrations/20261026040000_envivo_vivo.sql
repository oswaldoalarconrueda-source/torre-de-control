-- En vivo: el resumen (envivo_pulso) y los cambios nuevos salen de la MISMA lectura de la base. Antes iban por separado
-- y los cambios se reproducían un minuto después de que ya estaban sumados: estallaba una entrega y el número no se
-- movía. Ahora cada cambio nuevo ya está en el número de esa lectura; la pantalla lo resta mientras el cambio espera su
-- turno y lo suma cuando estalla.
-- p_marca: el "ahora" de la lectura anterior (null en la primera). Se devuelven los cambios de la ventana que entraron
-- a la base desde 3 minutos antes de la marca (por si una sincronización terminó tarde); la pantalla descarta los que
-- ya vio. En la primera lectura van además los 300 más recientes de la ventana, para la lista.
create or replace function public.envivo_vivo(p_cuentas text[] default null, p_minutos integer default 60,
  p_desde date default null, p_hasta date default null, p_marca timestamptz default null)
returns jsonb language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with par as (select p_minutos <= 0 as hoy, greatest(1, least(p_minutos, 1440)) as m, p_desde is not null as rango),
  c as (
    select a.slug,
      case when (select rango from par) then (p_desde::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz
           when (select hoy from par) then (((now() + make_interval(mins => a.tz_offset_min))::date)::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz
           else now() - make_interval(mins => (select m from par)) end as desde,
      case when (select rango from par)
           then least(now(), ((coalesce(p_hasta, p_desde) + 1)::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz)
           else now() end as hasta
    from public.effi_accounts a
    where a.tipo = 'tienda' and a.activa
      and a.slug = any (public.app_cuentas_visibles())
      and (p_cuentas is null or a.slug = any (p_cuentas))
  ),
  ev as (
    select e.cuenta, e.guia, e.fecha_hist_est, e.estado_new_efficommerce, e.estado_new, e.nombre_transportadora_efficommerce,
      g.nombre_ciudad_destinatario, g.nombre_provincia_destinatario, g.valor_recaudo, e.est_guia_new_efficommerce,
      g.fecha_recaudo is not null as pagada, e.actualizado_en
    from public.effi_guia_estados e
    join c on c.slug = e.cuenta
    left join public.effi_guias g on g.cuenta = e.cuenta and g.empresa = e.empresa and g.sucursal = e.sucursal and g.id = e.id_guia
    where e.fecha_hist_est >= c.desde and e.fecha_hist_est < c.hasta + interval '1 second'
  ),
  sale as (
    (select * from ev where p_marca is null order by fecha_hist_est desc limit 300)
    union
    (select * from ev where ev.actualizado_en > coalesce(p_marca, now()) - interval '3 minutes' order by actualizado_en desc limit 500)
  )
  select jsonb_build_object(
    'pulso', public.envivo_pulso(p_cuentas, p_minutos, p_desde, p_hasta),
    'marca', now(),
    'eventos', coalesce((select jsonb_agg(to_jsonb(s) - 'actualizado_en' order by s.fecha_hist_est desc) from sale s), '[]'::jsonb)
  );
$$;
revoke all on function public.envivo_vivo(text[], integer, date, date, timestamptz) from public, anon;
grant execute on function public.envivo_vivo(text[], integer, date, date, timestamptz) to authenticated, service_role;
