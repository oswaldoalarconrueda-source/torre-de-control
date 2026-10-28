-- A un clic (sociedad aparte) entra a la Torre con su cuenta de Effi en Guatemala, igual que Valka. Queda inactiva hasta
-- que su API key esté en el Vault (scripts/guardar-effi-llave.sh AUNCLIC_GT + scripts/push-effi-keys.mjs); al activarla,
-- la sincronización la toma sola y sus socios la ven por la sociedad "A un clic".
insert into public.effi_accounts (slug, nombre, tipo, pais, divisa, activa, tz_offset_min, sociedad)
values ('AUNCLIC_GT', 'A UN CLIC GT', 'tienda', 'GT', 'GTQ', false, -360, 'A un clic')
on conflict (slug) do nothing;

-- Hecho el 28-oct con la llave ya en el Vault (conexión probada: A UN CLIC GT, empresa 54019): activa, historial en
-- cola (guías y wallet desde 2025, novedades e historial de estados recientes), agente de órdenes en "vigilar" y agente
-- admin apagado.
-- update effi_accounts set activa = true, empresa_id = 54019 where slug = 'AUNCLIC_GT'; + effi_sync_jobs + auto_config + admin_config
