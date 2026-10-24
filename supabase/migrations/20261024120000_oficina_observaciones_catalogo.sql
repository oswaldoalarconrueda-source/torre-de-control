-- Observaciones seleccionables (sin texto libre): catálogo cerrado agrupado a partir de las observaciones que el
-- equipo escribía en Drive. "retira_fecha" guarda la fecha prometida para medir si el cliente cumplió.

alter table public.oficina_observaciones
  add column codigo text check (codigo in ('retira_fecha', 'ya_retiro', 'sin_respuesta', 'colgo', 'no_desea',
                                           'no_puede_ahora', 'numero_incorrecto', 'numero_ajeno', 'numero_no_disponible')),
  add column fecha_compromiso date,
  alter column observacion drop not null,
  add constraint oficina_obs_fecha check ((codigo = 'retira_fecha') = (fecha_compromiso is not null) or codigo is null);

create or replace function public.oficina_lista(p_cuenta text) returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('oficina')) as ok),
  g as (
    select v.cuenta, v.empresa, v.sucursal, v.id, v.guia, v.nombre_transportadora_efficommerce as transportadora,
      v.nombre_destinatario as destinatario, v.telefonos_destinatario as telefono, v.nombre_ciudad_destinatario as ciudad,
      v.nombre_provincia_destinatario as provincia, v.direccion_destinatario as direccion, v.valor_recaudo as valor,
      v.ultimo_cambio_estado, v.fecha_trans
    from public.v_guias v
    where v.cuenta = p_cuenta and (select ok from permitido)
      and v.est_guia_efficommerce = 9 and v.fecha_recaudo is null and v.fecha_anular is null and v.vigente is not false
  )
  select coalesce(jsonb_agg(x order by x.llegada desc nulls last), '[]'::jsonb) from (
    select g.guia, g.transportadora, g.destinatario, g.telefono, g.ciudad, g.provincia, g.direccion, g.valor, g.fecha_trans,
      coalesce((select min(e.fecha_hist_est) from public.effi_guia_estados e
                where e.cuenta = g.cuenta and e.empresa = g.empresa and e.sucursal = g.sucursal and e.id_guia = g.id
                  and e.est_guia_new_efficommerce = 9), g.ultimo_cambio_estado) as llegada,
      coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'intento', l.intento, 'resultado', l.resultado, 'canal', l.canal,
                                                    'nota', l.nota, 'usuario', l.usuario_email, 'creado_en', l.creado_en) order by l.intento)
                from public.oficina_llamadas l where l.cuenta = g.cuenta and l.guia = g.guia), '[]'::jsonb) as llamadas,
      (select jsonb_build_object('codigo', o.codigo, 'fecha', o.fecha_compromiso, 'texto', o.observacion,
                                 'usuario', o.usuario_email, 'actualizado_en', o.actualizado_en)
       from public.oficina_observaciones o where o.cuenta = g.cuenta and o.guia = g.guia) as observacion
    from g
  ) x;
$$;

create or replace function public.oficina_estadisticas(p_cuenta text, p_dias integer default 14) returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('oficina')) as ok),
  tz as (select make_interval(mins => tz_offset_min) as off from public.effi_accounts where slug = p_cuenta),
  desde as (select ((now() + (select off from tz))::date - (greatest(1, least(p_dias, 60)) - 1)) as dia),
  -- Primera llegada a oficina de cada guía dentro del rango.
  llegadas as (
    select e.cuenta, e.empresa, e.sucursal, e.id_guia, min(e.fecha_hist_est) as llegada
    from public.effi_guia_estados e
    where e.cuenta = p_cuenta and (select ok from permitido) and e.est_guia_new_efficommerce = 9
      and e.fecha_hist_est >= ((select dia from desde)::timestamp - (select off from tz))::timestamptz - interval '1 day'
    group by 1, 2, 3, 4
  ),
  guias as (
    select g.guia, (l.llegada + (select off from tz))::date as dia,
      case when g.fecha_recaudo is not null or g.est_guia_efficommerce = 4 then 'entregada'
           when g.est_guia_efficommerce = 5 then 'devuelta'
           when g.est_guia_efficommerce = 9 then 'en_oficina' else 'otra' end as fin,
      exists (select 1 from public.oficina_llamadas c where c.cuenta = p_cuenta and c.guia = g.guia) as llamada
    from llegadas l
    join public.effi_guias g on g.cuenta = l.cuenta and g.empresa = l.empresa and g.sucursal = l.sucursal and g.id = l.id_guia
    where (l.llegada + (select off from tz))::date >= (select dia from desde)
  ),
  llamadas as (
    select c.*, (c.creado_en + (select off from tz)) as local,
      case when g.fecha_recaudo is not null or g.est_guia_efficommerce = 4 then 'entregada'
           when g.est_guia_efficommerce = 5 then 'devuelta' else 'abierta' end as fin
    from public.oficina_llamadas c
    left join public.effi_guias g on g.cuenta = c.cuenta and g.guia = c.guia
    where c.cuenta = p_cuenta and (select ok from permitido)
      and (c.creado_en + (select off from tz))::date >= (select dia from desde)
  ),
  -- Observaciones registradas en el rango, con el resultado de la guía y si se cumplió la fecha prometida.
  obs as (
    select o.codigo, o.fecha_compromiso,
      case when g.fecha_recaudo is not null or g.est_guia_efficommerce = 4 then 'entregada'
           when g.est_guia_efficommerce = 5 then 'devuelta'
           when g.est_guia_efficommerce = 9 then 'en_oficina' else 'otra' end as fin,
      (coalesce(g.fecha_entrega, g.fecha_recaudo) + (select off from tz))::date as entregada_dia
    from public.oficina_observaciones o
    join public.effi_guias g on g.cuenta = o.cuenta and g.guia = o.guia
    where o.cuenta = p_cuenta and (select ok from permitido) and o.codigo is not null
      and (o.actualizado_en + (select off from tz))::date >= (select dia from desde)
  ),
  dias as (select generate_series((select dia from desde), (now() + (select off from tz))::date, interval '1 day')::date as dia)
  select jsonb_build_object(
    'dias', (select jsonb_agg(jsonb_build_object(
        'dia', d.dia,
        'llegaron', (select count(*) from guias where guias.dia = d.dia),
        'llamadas', (select count(*) from llamadas where llamadas.local::date = d.dia),
        'guias_llamadas', (select count(distinct guia) from llamadas where llamadas.local::date = d.dia),
        'contesto', (select count(*) from llamadas where llamadas.local::date = d.dia and resultado = 'contesto'),
        'no_contesto', (select count(*) from llamadas where llamadas.local::date = d.dia and resultado = 'no_contesto'),
        'telefono_malo', (select count(*) from llamadas where llamadas.local::date = d.dia and resultado = 'telefono_malo'),
        'entregadas', (select count(*) from guias where guias.dia = d.dia and fin = 'entregada'),
        'devueltas', (select count(*) from guias where guias.dia = d.dia and fin = 'devuelta'),
        'en_oficina', (select count(*) from guias where guias.dia = d.dia and fin = 'en_oficina'),
        'llamadas_entregadas', (select count(*) from guias where guias.dia = d.dia and llamada and fin = 'entregada'),
        'llamadas_total', (select count(*) from guias where guias.dia = d.dia and llamada),
        'sin_llamar_entregadas', (select count(*) from guias where guias.dia = d.dia and not llamada and fin = 'entregada'),
        'sin_llamar_total', (select count(*) from guias where guias.dia = d.dia and not llamada)
      ) order by d.dia desc) from dias d),
    'horas', coalesce((select jsonb_agg(h order by h.hora) from (
        select extract(hour from local)::int as hora, count(*) as llamadas,
          count(*) filter (where resultado = 'contesto') as contesto,
          count(distinct guia) filter (where fin = 'entregada') as entregadas,
          count(distinct guia) as guias
        from llamadas group by 1) h), '[]'::jsonb),
    'observaciones', coalesce((select jsonb_agg(o order by o.guias desc) from (
        select codigo, count(*) as guias,
          count(*) filter (where fin = 'entregada') as entregadas,
          count(*) filter (where fin = 'devuelta') as devueltas,
          count(*) filter (where fin = 'en_oficina') as en_oficina,
          count(*) filter (where fecha_compromiso is not null) as con_fecha,
          count(*) filter (where fecha_compromiso is not null and fin = 'entregada' and entregada_dia <= fecha_compromiso + 1) as cumplieron
        from obs group by 1) o), '[]'::jsonb),
    'intentos', coalesce((select jsonb_agg(i order by i.intento) from (
        select least(intento, 4) as intento, count(*) as llamadas,
          count(*) filter (where resultado = 'contesto') as contesto,
          count(distinct guia) filter (where fin = 'entregada') as entregadas,
          count(distinct guia) as guias
        from llamadas group by 1) i), '[]'::jsonb)
  );
$$;
revoke all on function public.oficina_estadisticas(text, integer) from public, anon;
grant execute on function public.oficina_estadisticas(text, integer) to authenticated;
