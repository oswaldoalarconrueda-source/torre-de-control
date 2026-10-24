-- Aplicada al proyecto Supabase "Super Data" (jlshlpotjpzwlxwdaktq) el 2026-10-23.

-- Cuentas Effi conectadas (las API keys NO van aquí; viven en el .env / secretos del servidor)
create table public.effi_accounts (
  slug        text primary key,                       -- TIENDA_CO, PROV_GT1, ...
  nombre      text not null,
  tipo        text not null check (tipo in ('tienda','proveeduria')),
  pais        text not null,                          -- ISO-2
  divisa      text,
  activa      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.effi_accounts (slug, nombre, tipo, pais, divisa) values
  ('TIENDA_CO','NATURALFITT CO','tienda','CO','COP'),
  ('TIENDA_EC','NATURALFITT EC','tienda','EC','USD'),
  ('TIENDA_GT','NATURALFITT GT','tienda','GT','GTQ'),
  ('TIENDA_CR','NATURALFITT CR','tienda','CR','CRC');

-- Bandeja de entrada de webhooks de Effi: se guarda el aviso crudo (no confiable) y luego
-- un proceso vuelve a consultar el registro en la API de Effi con la API key de la cuenta.
create table public.effi_webhook_events (
  id            bigint generated always as identity primary key,
  cuenta        text not null references public.effi_accounts(slug),
  delivery_id   text not null,                        -- X-Effi-Delivery (idempotencia)
  evento        text,                                 -- X-Effi-Event
  firma         text,                                 -- X-Effi-Signature (sha256=...), guardada para auditoría
  payload       jsonb not null,
  recibido_en   timestamptz not null default now(),
  procesado_en  timestamptz,
  error         text,
  unique (cuenta, delivery_id)
);

create index effi_webhook_events_pendientes on public.effi_webhook_events (recibido_en) where procesado_en is null;
create index effi_webhook_events_cuenta_evento on public.effi_webhook_events (cuenta, evento, recibido_en desc);

-- Solo el servidor (service_role) lee y escribe; sin políticas = nadie más.
alter table public.effi_accounts enable row level security;
alter table public.effi_webhook_events enable row level security;
