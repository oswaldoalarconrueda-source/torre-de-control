-- Homologación «Testeo» (pedido del dueño, 19-nov-2026): las campañas de prueba van a un mismo producto llamado Testeo.
-- Las reglas que ya existían con el nombre «Test» (RESPIGO en A un clic, VENTKIT/KITREPARADOR en Colombia) pasan a «Testeo».
-- En Homologar campañas, «Testeo» sale siempre de primera opción (web/src/app/(panel)/productos/homologar/page.tsx).
update public.prod_campana_reglas set producto = 'Testeo' where producto = 'Test';
update public.prod_campana_asignada set producto = 'Testeo' where producto = 'Test';
