-- 🤖 Agente · modo Automático (SOLO GUATEMALA). En cada corrida del horario (cada 10 min y 2 min antes de cada
-- corte) auto-convertir crea solo la remisión y la guía de cada orden lista, y la guía de las remisiones vigentes sin
-- guía (de más de 15 minutos, para no chocar con quien la esté haciendo a mano).
-- Candado: una sola corrida a la vez por país (además, cada creación lleva idempotency_key y Effi no la duplica).

alter table public.auto_config add column corriendo_hasta timestamptz;

create function public.auto_candado(p_cuenta text, p_segundos integer) returns boolean
language sql security definer set search_path = '' as $$
  with t as (
    update public.auto_config set corriendo_hasta = now() + make_interval(secs => p_segundos)
    where cuenta = p_cuenta and (corriendo_hasta is null or corriendo_hasta < now())
    returning 1
  )
  select exists (select 1 from t);
$$;
create function public.auto_soltar(p_cuenta text) returns void
language sql security definer set search_path = '' as $$
  update public.auto_config set corriendo_hasta = null where cuenta = p_cuenta;
$$;
revoke all on function public.auto_candado(text, integer) from public, anon, authenticated;
revoke all on function public.auto_soltar(text) from public, anon, authenticated;

-- El dueño puede elegir "automatico" solo en Guatemala.
create or replace function public.auto_cambiar_modo(p_cuenta text, p_modo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño puede cambiar el modo'; end if;
  if p_modo = 'automatico' and p_cuenta <> 'TIENDA_GT' then
    raise exception 'El modo automático solo está montado para Guatemala';
  end if;
  update public.auto_config
  set modo = p_modo, actualizado_en = now(), actualizado_por = (select email from auth.users where id = auth.uid())
  where cuenta = p_cuenta;
end $$;
