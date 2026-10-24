-- CRM de oficina con el formato que el equipo usaba en Drive: Contacto 1, 2 y 3 por llamada, Contacto 4 por
-- WhatsApp, cada uno Contactado / No contesta / No aplica, y una Observación por guía.
-- (En la base: contesto = Contactado, no_contesto = No contesta, telefono_malo = No aplica.)

alter table public.oficina_llamadas add column canal text not null default 'llamada' check (canal in ('llamada', 'whatsapp'));

-- Quien registró un contacto puede corregirlo (el dueño, cualquiera). La hora y el usuario originales se conservan.
create policy oficina_llamadas_corregir on public.oficina_llamadas for update to authenticated
  using (usuario = (select auth.uid()) or (select public.app_es_owner()))
  with check (cuenta = any ((select public.app_cuentas_visibles('oficina'))::text[]));
create function public.oficina_llamadas_corregida() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.cuenta := old.cuenta; new.guia := old.guia; new.intento := old.intento;
  new.usuario := old.usuario; new.usuario_email := old.usuario_email; new.creado_en := old.creado_en;
  return new;
end $$;
create trigger oficina_llamadas_corregida before update on public.oficina_llamadas
for each row execute function public.oficina_llamadas_corregida();

create table public.oficina_observaciones (
  cuenta text not null references public.effi_accounts (slug),
  guia text not null,
  observacion text not null check (char_length(observacion) <= 1000),
  usuario_email text,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, guia)
);
create function public.oficina_observaciones_antes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.usuario_email := (select email from auth.users where id = auth.uid());
  new.actualizado_en := now();
  return new;
end $$;
create trigger oficina_observaciones_antes before insert or update on public.oficina_observaciones
for each row execute function public.oficina_observaciones_antes();
alter table public.oficina_observaciones enable row level security;
create policy oficina_obs_leer on public.oficina_observaciones for select to authenticated
  using (cuenta = any ((select public.app_cuentas_visibles('oficina'))::text[]));
create policy oficina_obs_crear on public.oficina_observaciones for insert to authenticated
  with check (cuenta = any ((select public.app_cuentas_visibles('oficina'))::text[]));
create policy oficina_obs_editar on public.oficina_observaciones for update to authenticated
  using (cuenta = any ((select public.app_cuentas_visibles('oficina'))::text[]))
  with check (cuenta = any ((select public.app_cuentas_visibles('oficina'))::text[]));

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
      (select jsonb_build_object('texto', o.observacion, 'usuario', o.usuario_email, 'actualizado_en', o.actualizado_en)
       from public.oficina_observaciones o where o.cuenta = g.cuenta and o.guia = g.guia) as observacion
    from g
  ) x;
$$;
