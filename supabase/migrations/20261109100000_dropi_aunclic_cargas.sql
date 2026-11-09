-- Los tres archivos de Dropi subidos el 9-nov-2026 a las 06:33 (cargas 114, 115 y 116: tiendas Dropi 1331725,
-- "A Un Clic" y 7369799) son de A un clic, no de Joalix: /cargas los mandó a TIENDA_GT porque eran en quetzales. Se
-- pasan a AUNCLIC_GT. No pisaron nada de Joalix (sus IDs no coinciden con las cargas 111-113 de la tienda 1117416).
update public.dropi_ordenes set cuenta = 'AUNCLIC_GT' where cuenta = 'TIENDA_GT' and carga_id in (114, 115, 116);
update public.dropi_orden_productos set cuenta = 'AUNCLIC_GT' where cuenta = 'TIENDA_GT' and carga_id in (114, 115, 116);
update public.dropi_cartera set cuenta = 'AUNCLIC_GT' where cuenta = 'TIENDA_GT' and carga_id in (114, 115, 116);
update public.app_cargas set cuenta = 'AUNCLIC_GT' where id in (114, 115, 116) and cuenta = 'TIENDA_GT';
