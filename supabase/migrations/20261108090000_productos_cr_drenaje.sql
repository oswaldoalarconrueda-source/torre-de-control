-- 📦 Costa Rica: los dos productos que vende ("PRIVADO ALI CR" y "PRIVADO SN CR") son Drenaje Linfático (lo confirmó
-- el dueño el 8-nov-2026). Solo para TIENDA_CR, antes que las reglas generales.
insert into public.prod_alias (cuenta, patron, producto, prioridad)
select 'TIENDA_CR', '^PRIVADO (ALI|SN) CR', 'Drenaje Linfático', 10
where not exists (select 1 from public.prod_alias where cuenta = 'TIENDA_CR' and patron = '^PRIVADO (ALI|SN) CR');

-- Lo asignado a mano con el nombre viejo pasa al canónico, para que su publicidad caiga en el mismo producto.
update public.prod_campana_asignada set producto = 'Drenaje Linfático'
where cuenta = 'TIENDA_CR' and public.prod_clave(producto) ~ '^PRIVADO (ALI|SN) CR';
