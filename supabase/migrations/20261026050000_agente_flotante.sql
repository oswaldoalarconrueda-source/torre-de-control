-- Agente flotante: el resumen del agente de cada país que el usuario puede ver, para el panel que se abre desde
-- cualquier pantalla (sin entrar a /agente). Por país: modo, si está corriendo, la última corrida, el resumen de los
-- últimos 3 días (el mismo de /agente) y los errores de hoy (órdenes con un intento fallido hoy que aún no están
-- completas).
create or replace function public.auto_flotante() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'cuenta', c.cuenta,
    'modo', c.modo,
    'corriendo', c.corriendo_hasta is not null and c.corriendo_hasta > now(),
    'ultima_corrida', c.ultima_corrida,
    'resumen', public.auto_lista(c.cuenta, 3) -> 'resumen',
    'errores_hoy', (
      select count(distinct e.id_orden) from public.auto_eventos e
      where e.cuenta = c.cuenta and e.ok is false and e.id_orden is not null
        and e.creado_en >= (((now() + make_interval(mins => a.tz_offset_min))::date)::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz
        and not exists (select 1 from public.auto_ordenes o where o.cuenta = e.cuenta and o.id = e.id_orden and o.guia is not null))
  ) order by c.cuenta), '[]'::jsonb)
  from public.auto_config c
  join public.effi_accounts a on a.slug = c.cuenta and a.activa
  where c.cuenta = any (public.app_cuentas_visibles('automatizacion'));
$$;
revoke all on function public.auto_flotante() from public, anon;
grant execute on function public.auto_flotante() to authenticated;
