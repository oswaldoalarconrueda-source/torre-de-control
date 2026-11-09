-- A un clic: la pauta entregada en países donde no tiene tienda (hoy Colombia) se carga a Honduras, no a Guatemala (lo
-- pidió el dueño el 9-nov-2026). En las pantallas esas campañas llevan un * rojo: el país real queda en
-- app_publicidad_campanas.pais.
update public.meta_portafolios set tienda = 'AUNCLIC_HN' where token = 'meta_access_token_aunclic';
