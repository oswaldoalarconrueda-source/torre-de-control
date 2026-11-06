create or replace function public.auto_matriz_ruta(p_destino text, p_dpto text default null, p_pais text default 'Colombia')
returns jsonb language sql stable security definer set search_path = '' as $$
  with c as (
    select transportadora, nombre, entrega, devol, exposicion, flete_entregado, flete_devolucion
    from public.auto_matriz_entrega
    where pais = p_pais and destino_norm = public.auto_norm(p_destino)
  )
  select jsonb_build_object(
    'nivel', case when exists (select 1 from c) then 'matriz' end,
    'opciones', coalesce((select jsonb_agg(jsonb_build_object('id', transportadora, 'nombre', nombre, 'entrega', entrega,
        'devol', devol, 'exposicion', exposicion, 'flete', flete_entregado, 'flete_devolucion', flete_devolucion)
      order by entrega desc, flete_entregado) from c), '[]'::jsonb),
    'recomendada', (select transportadora from c where flete_entregado is not null order by entrega desc, flete_entregado limit 1),
    'solo_inter', (select count(*) > 0 and count(*) filter (where transportadora <> 4) = 0 from c where flete_entregado is not null)
  );
$$;
