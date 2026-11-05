-- Prueba de capacidad (pedido del dueño, 5-nov): cuántas órdenes (o guías) crea el agente a la vez por país y cuántas como
-- máximo por corrida. Con paralelo = 1 todo va en serie como antes (regla del 30-oct); se sube por escalones vigilando que
-- Effi no cruce documentos.
alter table public.auto_config
  add column if not exists paralelo int not null default 1 check (paralelo between 1 and 10),
  add column if not exists max_crear int not null default 8 check (max_crear between 1 and 300);
