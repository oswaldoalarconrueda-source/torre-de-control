-- Cuentas publicitarias que el token ve pero no son de la sociedad: meta-gasto no las trae y su gasto se borra.
-- Las "Alma" (Cuenta Alma 01–04 y Alma 04 portafolio 1) están en el portafolio de Joaquin pero no son de Joalix.
alter table public.meta_cuentas_ads add column if not exists excluir boolean not null default false;
update public.meta_cuentas_ads set excluir = true where nombre ilike '%alma%';

delete from public.app_publicidad_campanas c using public.meta_cuentas_ads a where a.excluir and c.cuenta_ads = a.nombre;
delete from public.app_publicidad_diaria d using public.meta_cuentas_ads a where a.excluir and d.cuenta_ads = a.nombre;

-- La pestaña Publicidad no las cuenta como conectadas.
do $$
begin
  execute replace(replace(pg_get_functiondef('public.publicidad_resumen(text[], date, date)'::regprocedure),
    'from public.meta_cuentas_ads group by 1) x)', 'from public.meta_cuentas_ads where not excluir group by 1) x)'),
    'select a.nombre, a.token as portafolio, a.estado, a.divisa from public.meta_cuentas_ads a
            where not exists', 'select a.nombre, a.token as portafolio, a.estado, a.divisa from public.meta_cuentas_ads a
            where not a.excluir and not exists');
end $$;
