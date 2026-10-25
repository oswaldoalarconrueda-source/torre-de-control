-- Modo Automático / Manual también en Ecuador (el dueño quiere los mismos botones en todos los países). En Ecuador el
-- automático hace las guías; las remisiones no, porque la API de Effi falla al crearlas (error 1452 dentro de Effi).
create or replace function public.auto_cambiar_modo(p_cuenta text, p_modo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño puede cambiar el modo'; end if;
  if p_modo = 'automatico' and p_cuenta not in ('TIENDA_GT', 'TIENDA_EC') then
    raise exception 'El modo automático todavía no está montado para este país';
  end if;
  update public.auto_config
  set modo = p_modo, actualizado_en = now(), actualizado_por = (select email from auth.users where id = auth.uid())
  where cuenta = p_cuenta;
end $$;
