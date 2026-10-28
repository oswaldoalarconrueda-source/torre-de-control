-- Agente:
-- 1. Rutas por transportadora (datos de Effi de todos sus clientes, saliendo de Bogotá, con recaudo). Meses comparables
--    para octubre: junio y julio 2026 (agosto no, por el terremoto; septiembre Effi no lo trae por ciudad de destino)
--    para la ⭐ "recomendada por números" en el Ejecutar de Colombia. Los datos se cargan aparte (no van al repo).
-- 2. "Ejecutar" orden por orden lo puede pulsar cualquiera que tenga el módulo Agente de ese país (antes solo el dueño).
create or replace function public.auto_norm(t text) returns text language sql immutable as $$
  select upper(trim(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNAEIOUUN')));
$$;

create table if not exists public.auto_rutas (
  pais text not null default 'Colombia',
  origen text not null default 'Bogotá D.C.',
  destino text not null,
  dpto text,
  transportadora integer not null,      -- id de la transportadora en Effi Colombia: 1 Envía, 4 Inter, 6 Servientrega, 10 Coordinadora
  guias integer not null,
  devol numeric not null,               -- % de devolución
  periodo text not null default '2026-05..2026-08',
  destino_norm text generated always as (public.auto_norm(destino)) stored,
  dpto_norm text generated always as (public.auto_norm(dpto)) stored,
  primary key (pais, origen, destino, transportadora)
);
-- Un mismo destino puede venir con departamentos distintos (p. ej. "Otros"): el departamento entra en la llave.
update public.auto_rutas set dpto = '' where dpto is null;
alter table public.auto_rutas alter column dpto set default '', alter column dpto set not null;
alter table public.auto_rutas drop constraint auto_rutas_pkey, add primary key (pais, origen, destino, dpto, transportadora);
create index if not exists auto_rutas_destino on public.auto_rutas (pais, origen, destino_norm);
alter table public.auto_rutas enable row level security;

-- Opciones de transportadora para un destino: por ciudad si hay 100 guías o más; si no, por departamento ("Otros" no
-- cuenta como departamento); si tampoco, lo poco que haya de la ciudad. Recomendada = la de menor devolución con 100
-- guías o más. solo_inter = a ese destino solo han llegado guías por Inter (pueblos y zonas alejadas).
create or replace function public.auto_ruta(p_destino text, p_dpto text, p_origen text default 'Bogotá D.C.', p_pais text default 'Colombia')
returns jsonb language sql stable security definer set search_path = '' as $$
  with c as (
    select transportadora, guias, devol from public.auto_rutas
    where pais = p_pais and origen = p_origen and destino_norm = public.auto_norm(p_destino)
  ),
  d as (
    select transportadora, sum(guias)::int as guias, round(sum(guias * devol) / nullif(sum(guias), 0), 1) as devol
    from public.auto_rutas
    where pais = p_pais and origen = p_origen and dpto_norm = public.auto_norm(p_dpto) and dpto_norm <> 'OTROS'
    group by 1
  ),
  n as (
    select case when (select coalesce(sum(guias), 0) from c) >= 100 then 'ciudad'
                when exists (select 1 from d) then 'departamento'
                when exists (select 1 from c) then 'ciudad' end as nivel
  ),
  o as (
    select * from c where (select nivel from n) = 'ciudad'
    union all
    select * from d where (select nivel from n) = 'departamento'
  )
  select jsonb_build_object(
    'nivel', (select nivel from n),
    'opciones', coalesce((select jsonb_agg(jsonb_build_object('id', transportadora, 'guias', guias, 'devol', devol) order by devol) from o), '[]'::jsonb),
    'recomendada', (select transportadora from o where guias >= 100 order by devol limit 1),
    'solo_inter', (select count(*) filter (where transportadora <> 4) = 0 and coalesce(sum(guias) filter (where transportadora = 4), 0) >= 20 from c)
  );
$$;
revoke all on function public.auto_ruta(text, text, text, text) from public, anon, authenticated;

-- Ejecutar orden por orden: el dueño o cualquiera con el módulo Agente de ese país.
do $$
begin
  execute replace(pg_get_functiondef('public.auto_ejecutar_orden(text, integer, integer, text, integer)'::regprocedure),
    'if not public.app_es_owner() then raise exception ''Solo el dueño puede ejecutar''; end if;',
    'if not (public.app_es_owner() or p_cuenta = any (public.app_cuentas_visibles(''automatizacion''))) then
    raise exception ''No tienes permiso para ejecutar en este país''; end if;');
end $$;
