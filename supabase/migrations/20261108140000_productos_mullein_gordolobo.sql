-- 📦 Ecuador: todo lo que dice "Gordolobo" es el Mullein; en Effi el artículo 10 ya se llama "MULLEIN GORDOLOBO" (lo
-- dijo el dueño el 8-nov-2026). Un solo producto "Mullein Gordolobo" para guías, campañas y lo asignado a mano.
-- Patrón amplio para los nombres de campaña: MULLEIN, MULLEN, GORDOLOBO, GORDOLOGO, GRODOLOBO.
update public.prod_alias set patron = 'MULLE|GORDOLO|GRODOLO', producto = 'Mullein Gordolobo'
where patron = 'MULLEIN' and producto = 'Mullein';
update public.prod_campana_reglas set patron = 'MULLE|GORDOLO|GRODOLO', producto = 'Mullein Gordolobo'
where patron = 'MULLEIN' and producto = 'Mullein';
update public.prod_campana_asignada set producto = 'Mullein Gordolobo' where producto = 'Mullein';
