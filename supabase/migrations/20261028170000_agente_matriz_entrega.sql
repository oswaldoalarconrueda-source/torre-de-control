-- Colombia: matriz de cobertura (pedido del dueño, 28-oct). Por ciudad de destino y transportadora: % entregada,
-- % devolución, % exposición y flete (entregado y de devolución). Reemplaza a auto_rutas (devolución histórica de
-- Effi saliendo de Bogotá) para la ⭐ del agente: se recomienda la de mayor % de entrega. Solo las transportadoras
-- que usa el agente: 1 Envía, 4 Inter, 6 Servientrega, 10 Coordinadora (sin Domina ni TCC). Se carga del Excel con
-- scripts/cargar-matriz-entrega.py (reemplaza todo).
create table public.auto_matriz_entrega (
  pais text not null default 'Colombia',
  destino text not null,
  destino_norm text not null,
  transportadora integer not null,
  nombre text not null,
  entrega numeric(5,1) not null,
  devol numeric(5,1) not null,
  exposicion numeric(5,1),
  flete_entregado integer,
  flete_devolucion integer,
  cargado_en timestamptz not null default now(),
  primary key (pais, destino_norm, transportadora)
);
alter table public.auto_matriz_entrega enable row level security;

-- Opciones para una ciudad, de mayor a menor % de entrega. La matriz no trae departamento: se cruza por la ciudad.
-- solo_inter: la ciudad solo tiene cobertura de Inter (pueblo o zona alejada).
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
    -- Una fila sin flete (0 % y sin envíos) es "sin datos": no se recomienda.
    'recomendada', (select transportadora from c where flete_entregado is not null order by entrega desc, flete_entregado limit 1),
    'solo_inter', (select count(*) > 0 and count(*) filter (where transportadora <> 4) = 0 from c where flete_entregado is not null)
  );
$$;
revoke all on function public.auto_matriz_ruta(text, text, text) from public, anon;
grant execute on function public.auto_matriz_ruta(text, text, text) to authenticated, service_role;

-- Carga de la matriz desde scripts/cargar-matriz-entrega.py: reemplaza la del país. Solo con el token de sincronización
-- del agente (el mismo de los crons, en el Vault).
create or replace function public.auto_matriz_cargar(p_token text, p_pais text, p_filas jsonb, p_borrar boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_token is null or p_token <> (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token') then
    raise exception 'Token no válido';
  end if;
  if p_borrar then delete from public.auto_matriz_entrega where pais = p_pais; end if;
  insert into public.auto_matriz_entrega (pais, destino, destino_norm, transportadora, nombre, entrega, devol, exposicion, flete_entregado, flete_devolucion)
  select p_pais, f.destino, public.auto_norm(f.destino), f.transportadora, f.nombre, f.entrega, f.devol, f.exposicion, f.flete_entregado, f.flete_devolucion
  from jsonb_to_recordset(p_filas) as f(destino text, transportadora integer, nombre text, entrega numeric, devol numeric,
    exposicion numeric, flete_entregado integer, flete_devolucion integer)
  on conflict (pais, destino_norm, transportadora) do update set destino = excluded.destino, nombre = excluded.nombre,
    entrega = excluded.entrega, devol = excluded.devol, exposicion = excluded.exposicion,
    flete_entregado = excluded.flete_entregado, flete_devolucion = excluded.flete_devolucion, cargado_en = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.auto_matriz_cargar(text, text, jsonb, boolean) from public;
grant execute on function public.auto_matriz_cargar(text, text, jsonb, boolean) to anon, authenticated;
