-- Novedades: si la guía ya pasó a "Devolución a origen" el pedido no se puede salvar, así que sale de la bandeja de
-- llamadas, de los pendientes de los medidores (por país y por asesora) y de las novedades abiertas del informe diario.
-- El estado es el mismo que muestra la columna Guía de la bandeja: el de effi_guias o, si no está, el de la novedad.
create or replace function public.novedad_en_devolucion(n public.effi_novedades) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select g.estado_efficommerce from public.effi_guias g
                   where g.cuenta = n.cuenta and g.empresa = n.empresa and g.sucursal = n.sucursal_guia and g.id = n.id_guia),
                  n.estado, '') = 'Devolución a origen';
$$;
revoke all on function public.novedad_en_devolucion(public.effi_novedades) from public, anon, authenticated;

do $$
declare
  f text; nuevo text;
  cambios text[][] := array[
    array['public.novedades_bandeja(text[])',
          'where n.t_novedad = 2 and n.vigente is not false
      and (n.est_novedad = 1',
          'where n.t_novedad = 2 and n.vigente is not false and not public.novedad_en_devolucion(n)
      and (n.est_novedad = 1'],
    array['public.novedades_medidores(text[], date, date)',
          'where n.t_novedad = 2 and n.vigente is not false and n.est_novedad = 1 group by 1',
          'where n.t_novedad = 2 and n.vigente is not false and n.est_novedad = 1 and not public.novedad_en_devolucion(n) group by 1'],
    array['public.novedades_medidores(text[], date, date)',
          'n.est_novedad = 1 and n.vigente is not false
    where not exists',
          'n.est_novedad = 1 and n.vigente is not false and not public.novedad_en_devolucion(n)
    where not exists'],
    array['public.informe_diario(integer, text[])',
          'n.t_novedad = 2 and n.est_novedad = 1 and n.vigente is not false)',
          'n.t_novedad = 2 and n.est_novedad = 1 and n.vigente is not false and not public.novedad_en_devolucion(n))']
  ];
begin
  for i in 1 .. array_length(cambios, 1) loop
    f := pg_get_functiondef(cambios[i][1]::regprocedure);
    nuevo := replace(f, cambios[i][2], cambios[i][3]);
    if nuevo = f then raise exception 'No encontré el texto a cambiar en % (cambio %)', cambios[i][1], i; end if;
    execute nuevo;
  end loop;
end $$;
