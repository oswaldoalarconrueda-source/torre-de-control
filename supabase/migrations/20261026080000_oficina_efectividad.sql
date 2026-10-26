-- Disponible en oficina: efectividad del contacto medida por entregas. De las guías que el equipo contactó (al menos un
-- "Contactado") en los últimos 14 días, cuántas ya se entregaron; y cuántas guías contactadas se entregaron hoy (sube
-- con cada entrega).
create or replace function public.oficina_efectividad(p_cuenta text)
returns jsonb language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('oficina')) as ok),
  tz as (select make_interval(mins => tz_offset_min) as off from public.effi_accounts where slug = p_cuenta),
  hoy as (select (((now() + (select off from tz))::date)::timestamp - (select off from tz))::timestamptz as t),
  contactadas as (
    select distinct l.guia from public.oficina_llamadas l
    where l.cuenta = p_cuenta and (select ok from permitido) and l.resultado = 'contesto'
      and l.creado_en >= now() - interval '14 days'
  ),
  g as (
    select c.guia, (x.fecha_recaudo is not null or x.est_guia_efficommerce = 4) as entregada,
      coalesce(x.fecha_entrega, x.fecha_recaudo) as entregada_en
    from contactadas c
    join lateral (select * from public.effi_guias y where y.cuenta = p_cuenta and y.guia = c.guia order by y.fecha_trans desc limit 1) x on true
  )
  select jsonb_build_object(
    'contactadas', (select count(*) from g),
    'entregadas', (select count(*) from g where entregada),
    'entregadas_hoy', (select count(*) from g where entregada and entregada_en >= (select t from hoy))
  );
$$;
revoke all on function public.oficina_efectividad(text) from public, anon;
grant execute on function public.oficina_efectividad(text) to authenticated;
