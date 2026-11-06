-- Recaudo acreditado guardado en la guía (evita cruzar guía × wallet en cada consulta).
alter table public.effi_guias add column if not exists fecha_recaudo timestamptz;
alter table public.effi_guias add column if not exists valor_recaudado numeric;

create function public.effi_refrescar_recaudo(p_cuenta text, p_guias text[]) returns void
language sql security definer set search_path = '' as $$
  update public.effi_guias g
  set fecha_recaudo = w.fecha, valor_recaudado = w.valor
  from (
    select m.guia_inicial, min(m.fecha_trans) as fecha, sum(m.valor) as valor
    from public.effi_wallet m
    where m.cuenta = p_cuenta and m.t_movimiento = 1 and m.vigente is not false and m.guia_inicial = any (p_guias)
    group by m.guia_inicial
  ) w
  where g.cuenta = p_cuenta and g.guia = w.guia_inicial
    and (g.fecha_recaudo is distinct from w.fecha or g.valor_recaudado is distinct from w.valor);
$$;
revoke all on function public.effi_refrescar_recaudo(text, text[]) from public, anon, authenticated;

create or replace function public.effi_ingest(p_cuenta text, p_recurso text, p_payload jsonb) returns int
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_emp bigint;
  v_rows jsonb;
  n int := 0;
begin
  select empresa_id into v_emp from public.effi_accounts where slug = p_cuenta;
  select coalesce(jsonb_agg(public.effi_clean(x)), '[]'::jsonb) into v_rows
  from jsonb_array_elements(coalesce(p_payload -> 'data', '[]'::jsonb)) x;
  if jsonb_array_length(v_rows) = 0 then return 0; end if;

  if v_emp is null and p_recurso = 'guias' then
    v_emp := (v_rows -> 0 ->> 'empresa')::bigint;
    update public.effi_accounts set empresa_id = v_emp where slug = p_cuenta and empresa_id is null;
  end if;

  select jsonb_agg(r || jsonb_build_object('empresa', coalesce(r ->> 'empresa', r ->> 'empresa_distribuidor', v_emp::text)))
  into v_rows from jsonb_array_elements(v_rows) r;

  if p_recurso = 'guias' then
    n := public.effi_upsert_guias(p_cuenta, v_rows);
    perform public.effi_refrescar_recaudo(p_cuenta, array(select r ->> 'guia' from jsonb_array_elements(v_rows) r where r ->> 'guia' is not null));
  elsif p_recurso = 'wallet' then
    n := public.effi_upsert_wallet(p_cuenta, v_rows);
    perform public.effi_refrescar_recaudo(p_cuenta, array(select r ->> 'guia_inicial' from jsonb_array_elements(v_rows) r where (r ->> 't_movimiento') = '1'));
  elsif p_recurso like 'novedades%' then
    n := public.effi_upsert_novedades(p_cuenta, v_rows);
  elsif p_recurso = 'hist' then
    n := public.effi_upsert_guia_estados(p_cuenta, (
      select jsonb_agg(jsonb_build_object(
        'empresa', r -> 'empresa',
        'sucursal', r -> 'sucursal',
        'id_guia', r -> 'id',
        'fecha_hist_est', r -> 'fecha_hist_est',
        'guia_inicial_adicional', coalesce(nullif(r -> 'guia_inicial_adicional', 'null'::jsonb), '"1"'::jsonb),
        'est_guia_new', coalesce(nullif(r -> 'est_guia_new', 'null'::jsonb), '-1'::jsonb),
        'guia', r -> 'guia',
        'guia_adicional', r -> 'guia_adicional',
        'estado_new', r -> 'estado_new',
        'est_guia_new_efficommerce', r -> 'est_guia_new_efficommerce',
        'estado_new_efficommerce', r -> 'estado_new_efficommerce',
        'observacion_hist_est', r -> 'observacion_hist_est',
        'responsable_cambio', r -> 'responsable_cambio',
        'transportadora_efficommerce', r -> 'transportadora_efficommerce',
        'nombre_transportadora_efficommerce', r -> 'nombre_transportadora_efficommerce'))
      from jsonb_array_elements(v_rows) r));
    perform public.effi_upsert_guias(p_cuenta, (
      select jsonb_agg(g) from (
        select distinct on (r ->> 'empresa', r ->> 'sucursal', r ->> 'id')
          r || jsonb_build_object('ultimo_cambio_estado', r -> 'fecha_hist_est') g
        from jsonb_array_elements(v_rows) r
        order by r ->> 'empresa', r ->> 'sucursal', r ->> 'id', r ->> 'fecha_hist_est' desc
      ) s));
  else
    raise exception 'Recurso desconocido: %', p_recurso;
  end if;
  return n;
end $$;

update public.effi_guias g
set fecha_recaudo = w.fecha, valor_recaudado = w.valor
from (
  select cuenta, guia_inicial, min(fecha_trans) as fecha, sum(valor) as valor
  from public.effi_wallet where t_movimiento = 1 and vigente is not false
  group by cuenta, guia_inicial
) w
where g.cuenta = w.cuenta and g.guia = w.guia_inicial;

drop view public.v_guias;
create view public.v_guias with (security_invoker = true) as
select
  g.*,
  a.pais, a.nombre as nombre_cuenta,
  (g.fecha_trans + make_interval(mins => a.tz_offset_min))::date as fecha_local,
  case when g.fecha_recaudo is not null then 'ENTREGADO'
       else public.effi_estado_unificado(g.est_guia_efficommerce) end as estado_u,
  (g.fecha_anular is not null or g.vigente is false) as anulada,
  coalesce(g.nombre_destinatario like '*%', false) as recuperado
from public.effi_guias g
join public.effi_accounts a on a.slug = g.cuenta;
revoke all on public.v_guias from anon;
grant select on public.v_guias to authenticated;

create index if not exists effi_guias_fecha_trans on public.effi_guias (fecha_trans);
