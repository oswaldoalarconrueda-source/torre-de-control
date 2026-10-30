-- Huella del cliente (30-oct): historial de cada teléfono (guías, entregadas, devoluciones). La matriz viene del Excel
-- "Huella effi - lucid a agosto 2026" (Guatemala, hasta agosto 2026) y se suma con las guías de todas las tiendas del
-- país desde septiembre 2026 (las que trae la Torre). Son datos personales: la tabla no se lee directo, solo con
-- huella_cliente() para quien ve esa tienda.
create table if not exists public.huella_matriz (
  pais text not null,             -- 'GT'
  telefono text not null,         -- solo dígitos (8 en Guatemala)
  total integer not null,
  entregadas integer not null,
  devoluciones integer not null,
  fuente text not null,
  cargado_en timestamptz not null default now(),
  primary key (pais, telefono)
);
alter table public.huella_matriz enable row level security;

-- Carga por tandas desde scripts/cargar-huella.py (protegida con el token de sincronización).
create or replace function public.huella_cargar(p_token text, p_pais text, p_fuente text, p_filas jsonb, p_borrar boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_token is null or p_token <> (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token') then
    raise exception 'Token no válido';
  end if;
  if p_borrar then delete from public.huella_matriz where pais = p_pais; end if;
  insert into public.huella_matriz (pais, telefono, total, entregadas, devoluciones, fuente)
  select p_pais, f.t, f.n, f.e, f.d, p_fuente
  from jsonb_to_recordset(p_filas) as f(t text, n integer, e integer, d integer)
  on conflict (pais, telefono) do update set total = excluded.total, entregadas = excluded.entregadas,
    devoluciones = excluded.devoluciones, fuente = excluded.fuente, cargado_en = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.huella_cargar(text, text, text, jsonb, boolean) from public;
grant execute on function public.huella_cargar(text, text, text, jsonb, boolean) to anon, authenticated;

-- Huella de un teléfono para una tienda: matriz (hasta agosto) + guías de todas las tiendas del mismo país desde el
-- 1-sep-2026 (entregadas = estado 4, devoluciones = 5, como En vivo). Solo para quien ve esa tienda.
create or replace function public.huella_cliente(p_cuenta text, p_telefono text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with t as (select right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 8) as tel),
  pais as (select a.pais from public.effi_accounts a where a.slug = p_cuenta),
  m as (select h.* from public.huella_matriz h, t where h.pais = (select pais from pais) and h.telefono = t.tel),
  g as (
    select count(*) filter (where x.est_guia_efficommerce in (4, 5)) as total,
           count(*) filter (where x.est_guia_efficommerce = 4) as entregadas,
           count(*) filter (where x.est_guia_efficommerce = 5) as devoluciones,
           count(*) filter (where x.est_guia_efficommerce not in (4, 5) and x.vigente is not false) as en_curso
    from public.effi_guias x join public.effi_accounts a on a.slug = x.cuenta, t
    where a.tipo = 'tienda' and a.pais = (select pais from pais) and x.fecha_trans >= '2026-09-01'
      and t.tel in (left(regexp_replace(coalesce(x.telefonos_destinatario, ''), '\D', '', 'g'), 8),
                    right(regexp_replace(coalesce(x.telefonos_destinatario, ''), '\D', '', 'g'), 8))
  )
  select case when p_cuenta = any (public.app_cuentas_visibles(null)) and length((select tel from t)) = 8 then jsonb_build_object(
    'telefono', (select tel from t),
    'total', coalesce((select total from m), 0) + (select total from g),
    'entregadas', coalesce((select entregadas from m), 0) + (select entregadas from g),
    'devoluciones', coalesce((select devoluciones from m), 0) + (select devoluciones from g),
    'en_curso', (select en_curso from g),
    'matriz', (select jsonb_build_object('total', total, 'entregadas', entregadas, 'devoluciones', devoluciones, 'fuente', fuente) from m),
    'tiendas', (select jsonb_build_object('total', total, 'entregadas', entregadas, 'devoluciones', devoluciones) from g)
  ) end;
$$;
revoke all on function public.huella_cliente(text, text) from public, anon;
grant execute on function public.huella_cliente(text, text) to authenticated;
