-- Pedido del dueño (5-nov): las novedades de guías en "Devolución en Tránsito" (Ecuador, GINTRACOM) vuelven a la bandeja,
-- a los pendientes de los medidores y al informe diario, porque la transportadora pide una solución de la empresa y todavía
-- se puede dar. Las demás devoluciones siguen fuera, como desde el 27-oct.
create or replace function public.novedad_en_devolucion(n public.effi_novedades) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(g.estado_efficommerce, n.estado, '') = 'Devolución a origen'
     and coalesce(g.estado, n.estado, '') <> 'Devolución en Tránsito'
  from (select 1) uno
  left join public.effi_guias g
    on g.cuenta = n.cuenta and g.empresa = n.empresa and g.sucursal = n.sucursal_guia and g.id = n.id_guia;
$$;
revoke all on function public.novedad_en_devolucion(public.effi_novedades) from public, anon, authenticated;
