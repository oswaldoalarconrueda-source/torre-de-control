-- Memoria de cobertura de Ecuador: "Demasiadas peticiones" es el límite de Effi, no falta de cobertura de Gintracom.
-- Hasta hoy el agente lo tomaba como si la transportadora no cubriera la ciudad y la mandaba a Servientrega; así
-- quedaron mal marcadas 14 ciudades (Quito, Guayaquil, Cuenca…). Se borran y la función ya no guarda ese motivo.
delete from public.auto_cobertura where motivo ilike '%demasiadas peticiones%';

create or replace function public.auto_sin_cobertura(p_cuenta text, p_transportadora int, p_ciudad int, p_nombre_ciudad text, p_motivo text)
returns void language sql security definer set search_path = '' as $$
  insert into public.auto_cobertura (cuenta, transportadora, ciudad, nombre_ciudad, motivo)
  select p_cuenta, p_transportadora, p_ciudad, p_nombre_ciudad, left(p_motivo, 500)
  where coalesce(p_motivo, '') not ilike '%demasiadas peticiones%'
  on conflict (cuenta, transportadora, ciudad) do update
    set veces = auto_cobertura.veces + 1, motivo = excluded.motivo, visto_en = now(),
        nombre_ciudad = coalesce(excluded.nombre_ciudad, auto_cobertura.nombre_ciudad);
$$;
revoke all on function public.auto_sin_cobertura(text, int, int, text, text) from public, anon, authenticated;
