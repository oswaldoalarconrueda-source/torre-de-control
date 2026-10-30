-- Exportar las condiciones del agente de un país (30-oct): condiciones por ciudad de las asesoras y la matriz de
-- entrega, para revisarlas en Excel con las asesoras (scripts/exportar-condiciones.py). Protegida con el token de
-- sincronización, igual que las cargas.
create or replace function public.auto_exportar_condiciones(p_token text, p_cuenta text, p_pais text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_token is null or p_token <> (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token') then
    raise exception 'Token no válido';
  end if;
  return jsonb_build_object(
    'restricciones', coalesce((select jsonb_agg(jsonb_build_object('lugar', r.lugar, 'dpto', r.dpto, 'ciudades', r.ciudades,
        'palabra', r.palabra, 'en_ciudades', r.en_ciudades, 'tipo', r.tipo, 'motivo', r.motivo, 'creado_en', r.creado_en) order by r.lugar)
      from public.auto_restricciones r where r.cuenta = p_cuenta), '[]'::jsonb),
    'matriz', coalesce((select jsonb_agg(jsonb_build_object('destino', m.destino, 'transportadora', m.transportadora, 'nombre', m.nombre,
        'entrega', m.entrega, 'devol', m.devol, 'exposicion', m.exposicion, 'flete_entregado', m.flete_entregado,
        'flete_devolucion', m.flete_devolucion) order by m.destino_norm, m.entrega desc)
      from public.auto_matriz_entrega m where m.pais = p_pais), '[]'::jsonb)
  );
end $$;
revoke all on function public.auto_exportar_condiciones(text, text, text) from public;
grant execute on function public.auto_exportar_condiciones(text, text, text) to anon, authenticated;
