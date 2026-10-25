-- Valka Guatemala: su API key ya está en el Vault (conexión probada). Se activa, se carga su historial igual que las
-- demás cuentas y entra a la vigilancia de órdenes (modo 'vigilar') para que En vivo muestre sus órdenes y remisiones.
update public.effi_accounts set activa = true where slug = 'VALKA_GT';

-- Historial: guías y wallet desde enero de 2025 (el saldo en vivo suma toda la wallet), novedades de 90 días y
-- cambios de estado de 60, como las demás cuentas.
insert into public.effi_sync_jobs (cuenta, recurso, desde_utc, hasta_utc, avance_utc)
select 'VALKA_GT', r.recurso, r.desde, now(), r.desde
from (values
  ('guias', '2025-01-01'::timestamptz),
  ('wallet', '2025-01-01'::timestamptz),
  ('novedades_2', now() - interval '90 days'),
  ('novedades_1', now() - interval '30 days'),
  ('hist', now() - interval '60 days')
) as r(recurso, desde)
where not exists (select 1 from public.effi_sync_jobs j where j.cuenta = 'VALKA_GT' and j.recurso = r.recurso and j.estado = 'pendiente');

insert into public.auto_config (cuenta, modo, centro_normal, centro_recuperado, cortes)
values ('VALKA_GT', 'vigilar', 1, 1, '{}')
on conflict (cuenta) do nothing;
