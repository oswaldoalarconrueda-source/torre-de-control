-- Proveeduría (sociedad Distrilatam): sus tres empresas de Effi entran a la Torre. Venden a las tiendas (no hacen
-- guías); quedan inactivas hasta decidir qué se sincroniza de ellas, para no cargar la base. Con la cuenta registrada,
-- el receptor de webhooks (effi-webhook?cuenta=<slug>) ya acepta sus avisos.
insert into public.effi_accounts (slug, nombre, tipo, pais, divisa, activa, tz_offset_min, sociedad, empresa_id) values
  ('DISTRI_GT', 'DISTRIGUATEMALA', 'proveeduria', 'GT', 'GTQ', false, -360, 'Distrilatam', 25084),
  ('DISTRI_CR', 'DISTRICOSTARICA', 'proveeduria', 'CR', 'CRC', false, -360, 'Distrilatam', 40014),
  ('DISTRI_LAB', 'DISTRILAB', 'proveeduria', 'GT', 'GTQ', false, -360, 'Distrilatam', 53639)
on conflict (slug) do nothing;
