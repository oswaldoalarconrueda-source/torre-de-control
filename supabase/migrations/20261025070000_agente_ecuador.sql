-- 🇪🇨 Agente de Ecuador. Reglas del dueño:
-- - Cliente con * al inicio → centro de costos Pedidos Recuperados (2); el resto Principal (1).
-- - Dirección de entrega en oficina ("Oficina Servientrega …", "RETIRA EN CS …") → Servientrega.
-- - Las demás direcciones → Gintracom. Si Gintracom no deja hacer la guía, se hace con Servientrega y la ciudad queda
--   en la memoria de cobertura (auto_cobertura) para mandarla directo por Servientrega la próxima vez.
-- Arranca en Manual (simular): arma lo que haría sin crear nada, porque hoy las remisiones y guías las hace una
-- persona a mano.

create table public.auto_cobertura (
  cuenta text not null references public.effi_accounts (slug),
  transportadora int not null,
  ciudad int not null,
  nombre_ciudad text,
  motivo text,
  veces int not null default 1,
  visto_en timestamptz not null default now(),
  primary key (cuenta, transportadora, ciudad)
);
alter table public.auto_cobertura enable row level security;
create policy "cobertura_lectura" on public.auto_cobertura for select to authenticated
  using (public.app_puede_ver(cuenta, 'automatizacion'));

-- La llama el agente cuando la transportadora no deja hacer la guía para una ciudad.
create or replace function public.auto_sin_cobertura(p_cuenta text, p_transportadora int, p_ciudad int, p_nombre_ciudad text, p_motivo text)
returns void language sql security definer set search_path = '' as $$
  insert into public.auto_cobertura (cuenta, transportadora, ciudad, nombre_ciudad, motivo)
  values (p_cuenta, p_transportadora, p_ciudad, p_nombre_ciudad, left(p_motivo, 500))
  on conflict (cuenta, transportadora, ciudad) do update
    set veces = auto_cobertura.veces + 1, motivo = excluded.motivo, visto_en = now(),
        nombre_ciudad = coalesce(excluded.nombre_ciudad, auto_cobertura.nombre_ciudad);
$$;
revoke all on function public.auto_sin_cobertura(text, int, int, text, text) from public, anon, authenticated;

insert into public.auto_config (cuenta, modo, centro_normal, centro_recuperado, minutos_alerta, cada_min, cortes, antes_min)
values ('TIENDA_EC', 'simular', 1, 2, 30, 10, array[]::text[], 2)
on conflict (cuenta) do nothing;
