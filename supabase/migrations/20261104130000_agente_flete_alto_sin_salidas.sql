-- Flete alto (pedido del dueño, 4-nov): la guía que ya salió no sale en la alerta, porque ya no se puede hacer nada. Quedan solo
-- las que Effi deja anular: estado 1 Generada o 7, sin relación de despacho.
create or replace function public.auto_fletes_lista(p_cuenta text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with permitido as (select p_cuenta = any (public.app_cuentas_visibles('automatizacion')) as ok),
  ids as (
    select r.sucursal, r.id, true as en_regla from public.auto_guias_flete_alto(p_cuenta) r where (select ok from permitido)
    union
    select a.sucursal, a.id_guia, false from public.auto_flete_alertas a
    where a.cuenta = p_cuenta and a.decision in ('aprobada', 'anulada') and (select ok from permitido)
  ),
  fila as (
    select g.sucursal, g.id, g.guia, split_part(g.nombre_transportadora_efficommerce, ' ', 1) as transportadora,
      g.nombre_destinatario as cliente, g.nombre_ciudad_destinatario as ciudad, g.nombre_provincia_destinatario as provincia,
      g.valor_recaudo as recaudo, g.valor_flete as flete, g.estado_efficommerce as estado, g.est_guia_efficommerce as est,
      g.id_ref as remision, g.sucursal_ref, g.fecha_trans as fecha, g.nombre_centro_costos as centro,
      bool_or(i.en_regla) over (partition by g.sucursal, g.id) as en_regla,
      a.relacion, a.relacion_en, a.decision, a.decision_por, a.decision_en, a.error
    from ids i
    join public.effi_guias g on g.cuenta = p_cuenta and g.sucursal = i.sucursal and g.id = i.id
    left join public.auto_flete_alertas a on a.cuenta = g.cuenta and a.sucursal = g.sucursal and a.id_guia = g.id
  ),
  salida as (select distinct on (f.sucursal, f.id) to_jsonb(f) - 'sucursal_ref' - 'en_regla' as j, f.* from fila f)
  select jsonb_build_object(
    'pendientes', coalesce((select jsonb_agg(s.j || jsonb_build_object('anulable', true) order by s.fecha desc)
      from salida s
      where s.en_regla and s.est in (1, 7) and s.decision is distinct from 'aprobada' and s.relacion is null), '[]'::jsonb),
    'anuladas', coalesce((select jsonb_agg(s.j order by s.decision_en desc) from salida s
      where s.decision = 'anulada' and s.decision_en > now() - interval '5 days'
        and not exists (select 1 from public.effi_guias n where n.cuenta = p_cuenta and n.t_trans_ref = 4 and n.id_ref = s.remision
          and n.sucursal_ref = s.sucursal_ref and n.vigente)
        and not exists (select 1 from public.auto_ordenes o where o.cuenta = p_cuenta and o.id_remision = s.remision
          and o.sucursal_remision = s.sucursal_ref and o.rem_vigente is false)), '[]'::jsonb),
    'aprobadas', coalesce((select jsonb_agg(x.j) from (select s.j from salida s where s.decision = 'aprobada' order by s.decision_en desc limit 30) x), '[]'::jsonb)
  );
$$;
create or replace function public.auto_fletes_por_revisar(p_cuenta text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('sucursal', r.sucursal, 'id', r.id)), '[]'::jsonb)
  from public.auto_guias_flete_alto(p_cuenta) r
  left join public.auto_flete_alertas a on a.cuenta = r.cuenta and a.sucursal = r.sucursal and a.id_guia = r.id
  where r.est_guia_efficommerce in (1, 7) and a.decision is distinct from 'aprobada';
$$;
