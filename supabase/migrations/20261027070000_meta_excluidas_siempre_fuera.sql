-- Seguro para las cuentas excluidas (las Alma no son de la sociedad): cada vez que meta_guardar guarda, borra lo que
-- haya de ellas, aunque haya entrado por una versión vieja de meta-gasto o por un CSV.
delete from public.app_publicidad_campanas c using public.meta_cuentas_ads a where a.excluir and c.cuenta_ads = a.nombre;
delete from public.app_publicidad_diaria d using public.meta_cuentas_ads a where a.excluir and d.cuenta_ads = a.nombre;

do $$
declare f text := 'public.meta_guardar(jsonb, text[], date, date)';
begin
  execute replace(pg_get_functiondef(f::regprocedure),
    '  return jsonb_build_object(''filas'', v_n - v_omitidas',
    '  delete from public.app_publicidad_campanas c using public.meta_cuentas_ads a where a.excluir and c.cuenta_ads = a.nombre;
  delete from public.app_publicidad_diaria d using public.meta_cuentas_ads a where a.excluir and d.cuenta_ads = a.nombre;

  return jsonb_build_object(''filas'', v_n - v_omitidas');
end $$;

-- La carga por CSV (app_cargar, tipo meta_bm) tampoco deja entrar cuentas excluidas.
create or replace function public.meta_sin_excluidas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.meta_cuentas_ads a where a.excluir and a.nombre = new.cuenta_ads) then return null; end if;
  return new;
end $$;
drop trigger if exists meta_sin_excluidas on public.app_publicidad_campanas;
create trigger meta_sin_excluidas before insert or update on public.app_publicidad_campanas
  for each row execute function public.meta_sin_excluidas();
drop trigger if exists meta_sin_excluidas on public.app_publicidad_diaria;
create trigger meta_sin_excluidas before insert or update on public.app_publicidad_diaria
  for each row execute function public.meta_sin_excluidas();
