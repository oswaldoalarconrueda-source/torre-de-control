-- 🏤 Disponible en oficina como CRM: quien llama registra cada intento (contestó / no contestó / teléfono malo)
-- con lo que dijo el cliente. La lista pone arriba lo que llegó más reciente a oficina y abajo hay estadísticas
-- para medir cuántas se llaman, cuántas se entregan, cuántas se devuelven y a qué hora conviene llamar.

create table public.oficina_llamadas (
  id bigint generated always as identity primary key,
  cuenta text not null references public.effi_accounts (slug),
  guia text not null,
  intento integer not null default 0,
  resultado text not null check (resultado in ('contesto', 'no_contesto', 'telefono_malo')),
  nota text check (char_length(nota) <= 1000),
  usuario uuid not null default auth.uid(),
  usuario_email text,
  creado_en timestamptz not null default now()
);
create index oficina_llamadas_guia on public.oficina_llamadas (cuenta, guia, creado_en);
create index oficina_llamadas_fecha on public.oficina_llamadas (cuenta, creado_en desc);
comment on table public.oficina_llamadas is 'Llamadas a clientes con guía disponible en oficina (CRM de la Torre).';

-- Número de intento y correo de quien llama, puestos por la base (no por el navegador).
create function public.oficina_llamadas_antes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.usuario := auth.uid();
  new.usuario_email := (select email from auth.users where id = auth.uid());
  new.creado_en := now();
  select coalesce(max(intento), 0) + 1 into new.intento
  from public.oficina_llamadas where cuenta = new.cuenta and guia = new.guia;
  return new;
end $$;
create trigger oficina_llamadas_antes before insert on public.oficina_llamadas
for each row execute function public.oficina_llamadas_antes();

alter table public.oficina_llamadas enable row level security;
create policy oficina_llamadas_leer on public.oficina_llamadas for select to authenticated
  using (cuenta = any ((select public.app_cuentas_visibles('oficina'))::text[]));
create policy oficina_llamadas_crear on public.oficina_llamadas for insert to authenticated
  with check (cuenta = any ((select public.app_cuentas_visibles('oficina'))::text[]));
create policy oficina_llamadas_dueno on public.oficina_llamadas for delete to authenticated
  using ((select public.app_es_owner()));

-- Guías hoy en oficina, con su llegada a oficina y sus llamadas. Lo más nuevo arriba.
create function public.oficina_lista(p_cuenta text) returns jsonb
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
      coalesce((select jsonb_agg(jsonb_build_object('intento', l.intento, 'resultado', l.resultado, 'nota', l.nota,
                                                    'usuario', l.usuario_email, 'creado_en', l.creado_en) order by l.creado_en)
                from public.oficina_llamadas l where l.cuenta = g.cuenta and l.guia = g.guia), '[]'::jsonb) as llamadas
    from g
  ) x;
$$;
revoke all on function public.oficina_lista(text) from public, anon;
grant execute on function public.oficina_lista(text) to authenticated;

-- Estadísticas del CRM por día local: cuántas llegaron a oficina, cuántas se llamaron, cómo contestaron y en qué
-- terminaron; además por hora de la llamada y por número de intento.
create function public.oficina_estadisticas(p_cuenta text, p_dias integer default 14) returns jsonb
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
