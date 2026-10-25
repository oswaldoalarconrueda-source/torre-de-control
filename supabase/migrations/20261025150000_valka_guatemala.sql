-- Valka (sociedad aparte) entra a la Torre con su cuenta de Effi en Guatemala. Queda inactiva hasta que su API key
-- esté en el Vault (scripts/push-effi-keys.mjs); al activarla, la sincronización la toma sola y sus socios la ven por
-- la sociedad "Valka".
insert into public.effi_accounts (slug, nombre, tipo, pais, divisa, activa, tz_offset_min, sociedad)
values ('VALKA_GT', 'VALKA GT', 'tienda', 'GT', 'GTQ', false, -360, 'Valka')
on conflict (slug) do nothing;
