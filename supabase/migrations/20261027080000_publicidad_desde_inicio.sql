-- Publicidad de cada tienda solo desde que empezó a ser de la sociedad: lo anterior no cuenta. Colombia desde el
-- 1 de septiembre de 2026 (su gasto de enero a agosto no es de Joalix). Se borra lo que haya y un trigger impide que
-- vuelva a entrar, sea por la API de Meta (meta_guardar), por CSV (app_cargar) o por scripts/joalix-a-sql.mjs.
create table if not exists public.app_publicidad_inicio (
  cuenta text primary key references public.effi_accounts (slug),
  desde date not null
);
alter table public.app_publicidad_inicio enable row level security;
insert into public.app_publicidad_inicio (cuenta, desde) values ('TIENDA_CO', '2026-09-01')
on conflict (cuenta) do update set desde = excluded.desde;

delete from public.app_publicidad_diaria d using public.app_publicidad_inicio i where d.cuenta = i.cuenta and d.fecha < i.desde;
delete from public.app_publicidad_campanas c using public.app_publicidad_inicio i where c.cuenta = i.cuenta and c.fecha < i.desde;
delete from public.app_publicidad_mensual m using public.app_publicidad_inicio i where m.cuenta = i.cuenta and m.mes < i.desde;

-- Sirve para las tres tablas: las diarias tienen "fecha" y la mensual "mes".
create or replace function public.publicidad_desde_inicio() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_fecha date := coalesce(to_jsonb(new) ->> 'fecha', to_jsonb(new) ->> 'mes')::date;
begin
  if exists (select 1 from public.app_publicidad_inicio i where i.cuenta = new.cuenta and v_fecha < i.desde) then return null; end if;
  return new;
end $$;
drop trigger if exists publicidad_desde_inicio on public.app_publicidad_diaria;
create trigger publicidad_desde_inicio before insert or update on public.app_publicidad_diaria
  for each row execute function public.publicidad_desde_inicio();
drop trigger if exists publicidad_desde_inicio on public.app_publicidad_campanas;
create trigger publicidad_desde_inicio before insert or update on public.app_publicidad_campanas
  for each row execute function public.publicidad_desde_inicio();
drop trigger if exists publicidad_desde_inicio on public.app_publicidad_mensual;
create trigger publicidad_desde_inicio before insert or update on public.app_publicidad_mensual
  for each row execute function public.publicidad_desde_inicio();
