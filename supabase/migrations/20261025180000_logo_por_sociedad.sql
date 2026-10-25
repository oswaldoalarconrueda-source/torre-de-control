-- Cada sociedad puede tener su logo (ruta pública de la web). Hoy solo Joalix AA Group lo tiene. En vivo pone al centro
-- el logo de la sociedad que se está mirando; si la sociedad no tiene logo (o se miran varias), el centro va vacío.
alter table public.app_sociedades add column if not exists logo text;
update public.app_sociedades set logo = '/logo-joalix.jpg' where nombre = 'Joalix AA Group';
