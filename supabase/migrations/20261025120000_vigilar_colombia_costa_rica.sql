-- Colombia y Costa Rica entran a la vigilancia del Agente (modo 'vigilar': solo trae órdenes y remisiones de Effi, no
-- simula ni crea nada). Así En vivo muestra sus órdenes y remisiones reales. El Agente de esos países sigue "en prueba".
insert into public.auto_config (cuenta, modo, centro_normal, centro_recuperado, cortes)
values ('TIENDA_CO', 'vigilar', 1, 1, '{}'), ('TIENDA_CR', 'vigilar', 1, 1, '{}')
on conflict (cuenta) do nothing;
