-- TRM por día (función trm-diaria): pesos por dólar (TRM oficial de Colombia) y quetzales por dólar (Banguat).
-- La publicidad llega en COP; con la tasa del mismo día se pasa a la moneda del país: Ecuador en dólares
-- (COP ÷ TRM) y Guatemala en quetzales (COP ÷ TRM × Banguat). Colombia queda en pesos.
create table if not exists public.app_trm_dia (
  fecha date primary key,
  usd_cop numeric not null,
  usd_gtq numeric not null,
  actualizado_en timestamptz not null default now()
);
alter table public.app_trm_dia enable row level security;
create policy app_trm_dia_leer on public.app_trm_dia for select to authenticated using (true);

-- COP → moneda local de la tienda con la tasa de ese día (o la última anterior). Sin tasa, null.
create or replace function public.app_cop_a_local_dia(p_cuenta text, p_cop numeric, p_fecha date) returns numeric
language sql stable security definer set search_path = '' as $$
  with t as (select usd_cop, usd_gtq from public.app_trm_dia where fecha <= p_fecha order by fecha desc limit 1),
  a as (select pais from public.effi_accounts where slug = p_cuenta)
  select case (select pais from a)
    when 'CO' then p_cop
    when 'EC' then p_cop / nullif((select usd_cop from t), 0)
    when 'GT' then p_cop / nullif((select usd_cop from t), 0) * (select usd_gtq from t)
  end;
$$;
grant execute on function public.app_cop_a_local_dia(text, numeric, date) to authenticated, service_role;

-- Dos veces al día (7:05 y 18:05 hora Colombia): la TRM de mañana se publica en la tarde.
create or replace function public.trm_refrescar() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/trm-diaria',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$$;
revoke all on function public.trm_refrescar() from public, anon, authenticated;
select cron.schedule('trm-diaria', '5 12,23 * * *', $$ select public.trm_refrescar(); $$);
