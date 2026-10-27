-- Tablero de proveeduría (Distrilatam): DISTRIGUATEMALA, DISTRILAB y DISTRICOSTARICA, cada una por separado (nunca se
-- suman). Sus cifras salen de los indicadores que Effi ya calcula (MCP "indicadores": ventas, compras, inventario,
-- cartera, tesorería, wallets, clientes, alertas), no de sincronizar documento por documento: así no se carga la base.
-- La función proveeduria los trae cada 30 min para los periodos del tablero y los guarda aquí.
create table public.prov_indicadores (
  cuenta text not null references public.effi_accounts (slug),
  periodo text not null check (periodo in ('hoy', 'ayer', '7d', 'mes', 'mes_ant')),
  bloque text not null,
  desde date not null,
  hasta date not null,
  datos jsonb not null,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, periodo, bloque)
);
alter table public.prov_indicadores enable row level security;

-- Lo que ve el tablero: los bloques de un periodo para una empresa visible para el usuario.
create or replace function public.prov_tablero(p_cuenta text, p_periodo text default 'mes') returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(i.bloque, i.datos || jsonb_build_object('_desde', i.desde, '_hasta', i.hasta, '_actualizado', i.actualizado_en)), '{}'::jsonb)
  from public.prov_indicadores i
  join public.effi_accounts a on a.slug = i.cuenta and a.tipo = 'proveeduria'
  where i.cuenta = p_cuenta and p_cuenta = any (public.app_cuentas_visibles())
    and (i.periodo = p_periodo or (i.bloque in ('inventario', 'cartera', 'tesoreria', 'alertas') and i.periodo = 'mes'));
$$;
revoke all on function public.prov_tablero(text, text) from public, anon;
grant execute on function public.prov_tablero(text, text) to authenticated;

-- Las tres empresas quedan activas (la sincronización solo trae su wallet; no tienen guías) y se refrescan cada 30 min.
update public.effi_accounts set activa = true where tipo = 'proveeduria' and slug in ('DISTRI_GT', 'DISTRI_CR', 'DISTRI_LAB');

create or replace function public.prov_refrescar() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/proveeduria',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 150000);
$$;
revoke all on function public.prov_refrescar() from public, anon, authenticated;
select cron.schedule('proveeduria-30min', '*/30 * * * *', $$ select public.prov_refrescar(); $$);
