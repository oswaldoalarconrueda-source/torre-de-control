-- 🤖 Agente: tarifas de la propuesta logística por transportadora, para estimar el flete cuando no hay guías propias ni
-- matriz (11-nov-2026). Las tarifas viven solo en la base (el repositorio es público y la propuesta no se sube): se cargan
-- a mano desde tools/propuestas. Parámetros (jsonb) por transportadora del plan:
--   flete (ya con el descuento por volumen), manejo_pct, manejo_decl_min, manejo_min, manejo_extra_recaudo,
--   rec_pct, rec_min, rec_fijo_hasta, rec_fijo, dev_recaudo (si la devolución cobra también la comisión de recaudo).
create table if not exists public.auto_propuesta_flete (
  pais text not null,
  transportadora integer not null,
  parametros jsonb not null,
  fuente text,
  actualizado_en timestamptz not null default now(),
  primary key (pais, transportadora)
);
alter table public.auto_propuesta_flete enable row level security;

create or replace function public.auto_propuesta_flete(p_cuenta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(p.transportadora::text, p.parametros), '{}'::jsonb)
  from public.auto_propuesta_flete p
  join public.effi_accounts a on a.slug = p_cuenta and a.pais = p.pais
  where p_cuenta = any (public.app_cuentas_visibles('automatizacion'));
$$;
revoke all on function public.auto_propuesta_flete(text) from public, anon;
grant execute on function public.auto_propuesta_flete(text) to authenticated;
