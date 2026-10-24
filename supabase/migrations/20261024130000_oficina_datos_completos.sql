-- Disponible en oficina con los mismos datos de la tabla del Dashboard Joalix: centro de costos, fecha de creación,
-- remitente, destinatario y su documento, país, departamento, ciudad, dirección, teléfonos, transportadora, guía,
-- valor, contenido (producto) y estados. El remitente no se guardaba: se agrega al sync de guías.
-- (La URL del PDF de la guía no la entrega la API de Effi; solo venía en el Excel exportado a mano.)

alter table public.effi_guias add column nombre_remitente text;

-- effi_upsert_guias toma los campos por nombre (jsonb_populate_recordset): basta con sumarlo al insert y al update.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.effi_upsert_guias'::regproc);
  d := replace(d, 'recaudo_efficommerce_transportadora, vigente, ultimo_cambio_estado)',
                  'recaudo_efficommerce_transportadora, vigente, ultimo_cambio_estado, nombre_remitente)');
  d := replace(d, 'r.recaudo_efficommerce_transportadora, r.vigente, r.ultimo_cambio_estado',
                  'r.recaudo_efficommerce_transportadora, r.vigente, r.ultimo_cambio_estado, r.nombre_remitente');
  d := replace(d, '    actualizado_en = now();',
                  '    nombre_remitente = coalesce(excluded.nombre_remitente, effi_guias.nombre_remitente),' || chr(10) || '    actualizado_en = now();');
  if d not like '%r.nombre_remitente%' or d not like '%excluded.nombre_remitente%' then
    raise exception 'No se pudo agregar nombre_remitente a effi_upsert_guias';
  end if;
  execute d;
end $$;

create or replace function public.oficina_lista(p_cuenta text) returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('oficina')) as ok),
  g as (
    select v.cuenta, v.empresa, v.sucursal, v.id, v.guia, v.nombre_transportadora_efficommerce as transportadora,
      v.nombre_destinatario as destinatario, v.id_destinatario, v.telefonos_destinatario as telefono,
      v.nombre_pais_destinatario as pais, v.nombre_ciudad_destinatario as ciudad, v.nombre_provincia_destinatario as provincia,
      v.direccion_destinatario as direccion, v.valor_recaudo as valor, v.contenido,
      case when v.recuperado then 'Recuperado' else v.nombre_centro_costos end as centro_costos,
      gg.nombre_remitente as remitente, v.estado, v.estado_efficommerce,
      v.ultimo_cambio_estado, v.fecha_trans
    from public.v_guias v
    join public.effi_guias gg on gg.cuenta = v.cuenta and gg.empresa = v.empresa and gg.sucursal = v.sucursal and gg.id = v.id
    where v.cuenta = p_cuenta and (select ok from permitido)
      and v.est_guia_efficommerce = 9 and v.fecha_recaudo is null and v.fecha_anular is null and v.vigente is not false
  )
  select coalesce(jsonb_agg(x order by x.llegada desc nulls last), '[]'::jsonb) from (
    select g.guia, g.transportadora, g.destinatario, g.id_destinatario, g.telefono, g.pais, g.ciudad, g.provincia, g.direccion,
      g.valor, g.contenido, g.centro_costos, g.remitente, g.estado, g.estado_efficommerce, g.fecha_trans,
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

-- Volver a traer las guías de los últimos 60 días para llenar el remitente de las que ya están cargadas.
select public.effi_sync_encolar('guias', now() - interval '60 days', now());
