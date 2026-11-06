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
