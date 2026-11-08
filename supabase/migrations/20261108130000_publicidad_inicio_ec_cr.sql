-- Publicidad solo desde que cada tienda empezó a vender (lo pidió el dueño el 8-nov-2026: "nada de julio aplica" para
-- Costa Rica, Ecuador ni Colombia). Primera guía en Effi: GT 27-jul, EC 12-ago, CO 2-sep, CR 29-oct de 2026.
-- Colombia ya estaba desde el 1-sep; se agregan Ecuador (1-ago) y Costa Rica (1-oct). Guatemala sí cuenta julio.
-- Se borra lo anterior (EC: $55.052.424 COP de julio, 140 campañas) y el trigger publicidad_desde_inicio impide que
-- vuelva a entrar por la API de Meta, por CSV o por scripts.
insert into public.app_publicidad_inicio (cuenta, desde) values ('TIENDA_EC', '2026-08-01'), ('TIENDA_CR', '2026-10-01')
on conflict (cuenta) do update set desde = excluded.desde;

delete from public.app_publicidad_diaria d using public.app_publicidad_inicio i where d.cuenta = i.cuenta and d.fecha < i.desde;
delete from public.app_publicidad_campanas c using public.app_publicidad_inicio i where c.cuenta = i.cuenta and c.fecha < i.desde;
delete from public.app_publicidad_mensual m using public.app_publicidad_inicio i where m.cuenta = i.cuenta and m.mes < i.desde;
