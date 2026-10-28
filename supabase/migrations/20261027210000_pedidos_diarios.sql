-- Pedidos diarios por tienda, tal como los cuenta la hoja "RELACION DE PEDIDOS JOALIX" que llena una empleada (mismo
-- número que LucidSales: la venta en el momento en que el cliente compra, no cuando la orden entra a Effi). Sirve para
-- el CPA real: gasto de Meta del día ÷ pedidos del día. Lo pasado no cambia, así que se graba una vez (los datos se
-- cargan aparte, no van al repo).
create table if not exists public.app_pedidos_diarios (
  cuenta text not null references public.effi_accounts (slug),
  fecha date not null,
  pedidos integer not null check (pedidos >= 0),
  fuente text not null default 'hoja RELACION DE PEDIDOS JOALIX',
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, fecha)
);
alter table public.app_pedidos_diarios enable row level security;
create policy app_pedidos_diarios_dueno on public.app_pedidos_diarios for all to authenticated
  using ((select public.app_es_owner())) with check ((select public.app_es_owner()));
create policy app_pedidos_diarios_leer on public.app_pedidos_diarios for select to authenticated
  using (cuenta = any ((select public.app_cuentas_visibles())::text[]));
