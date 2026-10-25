-- 🤖 Agente: totales del mes y del día (hora local del país). La vigilancia trae cada hora todo el mes en curso
-- (auto-vigilancia?mes=1) para que auto_ordenes tenga el mes completo; cada 2 minutos sigue con los últimos 3 días.
-- "Completada" = la orden ya tiene remisión y guía. No cuentan las órdenes anuladas que nunca tuvieron remisión.

create function public.auto_vigilancia_mes_disparar() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/auto-vigilancia?mes=1',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
$$;
revoke all on function public.auto_vigilancia_mes_disparar() from public, anon, authenticated;
select cron.schedule('auto-vigilancia-mes', '17 * * * *', 'select public.auto_vigilancia_mes_disparar();');

do $$
declare def text;
begin
  select pg_get_functiondef('public.auto_lista(text, integer)'::regprocedure) into def;
  def := replace(def,
    $a$'listas', count(*) filter (where estado = 'sin_remision' and plan_estado = 'lista'),$a$,
    $b$'listas', count(*) filter (where estado = 'sin_remision' and plan_estado = 'lista'),
        'mes_total', (select count(*) from public.auto_ordenes x, public.effi_accounts a
                      where x.cuenta = p_cuenta and a.slug = p_cuenta and (select ok from permitido)
                        and (x.fecha_orden + make_interval(mins => a.tz_offset_min))::date >= date_trunc('month', now() + make_interval(mins => a.tz_offset_min))::date
                        and not (x.id_remision is null and x.orden_vigente is not true)),
        'mes_completas', (select count(*) from public.auto_ordenes x, public.effi_accounts a
                      where x.cuenta = p_cuenta and a.slug = p_cuenta and (select ok from permitido)
                        and (x.fecha_orden + make_interval(mins => a.tz_offset_min))::date >= date_trunc('month', now() + make_interval(mins => a.tz_offset_min))::date
                        and x.id_remision is not null and x.guia is not null),
        'hoy_total', (select count(*) from public.auto_ordenes x, public.effi_accounts a
                      where x.cuenta = p_cuenta and a.slug = p_cuenta and (select ok from permitido)
                        and (x.fecha_orden + make_interval(mins => a.tz_offset_min))::date = (now() + make_interval(mins => a.tz_offset_min))::date
                        and not (x.id_remision is null and x.orden_vigente is not true)),
        'hoy_completas', (select count(*) from public.auto_ordenes x, public.effi_accounts a
                      where x.cuenta = p_cuenta and a.slug = p_cuenta and (select ok from permitido)
                        and (x.fecha_orden + make_interval(mins => a.tz_offset_min))::date = (now() + make_interval(mins => a.tz_offset_min))::date
                        and x.id_remision is not null and x.guia is not null),$b$);
  if position('mes_completas' in def) = 0 then raise exception 'auto_lista cambió: no se pudo ajustar'; end if;
  execute def;
end $$;
