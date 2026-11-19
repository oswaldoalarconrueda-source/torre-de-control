-- Drop por MCP: lo que dice Drop de cada orden (crudo), el progreso de la vuelta completa y el resultado de cada corrida.
-- drop_guardar_mcp definitiva: 20261118160000_drop_sync.sql y 20261118170000_drop_icomfly_cruce.sql.
create table if not exists public.drop_mcp_ordenes (
  cuenta text not null references public.effi_accounts (slug),
  id bigint not null,
  fecha date, hora text,
  estado_drop text,
  entregada boolean,
  venta numeric,
  abono numeric,
  abonado_en timestamp,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, id)
);
alter table public.drop_mcp_ordenes enable row level security;
alter table public.drop_conexion add column if not exists progreso jsonb;

create or replace function public.drop_progreso(p_cuenta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select progreso from public.drop_conexion where cuenta = p_cuenta;
$$;
create or replace function public.drop_progreso_guardar(p_cuenta text, p_progreso jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.drop_conexion set progreso = p_progreso where cuenta = p_cuenta;
$$;
create or replace function public.drop_sync_resultado(p_cuenta text, p_error text, p_resumen jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.drop_conexion set ultima_sync = case when p_error is null then now() else ultima_sync end,
    ultimo_error = p_error, resumen = p_resumen where cuenta = p_cuenta;
$$;
revoke all on function public.drop_progreso(text) from public, anon, authenticated;
revoke all on function public.drop_progreso_guardar(text, jsonb) from public, anon, authenticated;
revoke all on function public.drop_sync_resultado(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.drop_progreso(text), public.drop_progreso_guardar(text, jsonb), public.drop_sync_resultado(text, text, jsonb) to service_role;
