-- 🏤 Disponible en oficina con calendario arriba, como las demás pantallas (pedido del dueño, 11-nov-2026): el cuadre
-- diario, el resultado por día de llegada y "Quién hizo qué" aceptan un rango de fechas (p_desde, p_hasta). Sin rango
-- siguen como antes (últimos p_dias días hasta hoy). La lista para llamar no cambia: son las guías que hoy están en oficina.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.oficina_cuadre(text,integer)'::regprocedure);
  d := replace(d, 'p_dias integer DEFAULT 14)', 'p_dias integer DEFAULT 14, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)');
  d := replace(d, 'hoy as (select (now() + (select off from tz))::date as dia)',
    'hoy as (select least(coalesce(p_hasta, (now() + (select off from tz))::date), (now() + (select off from tz))::date) as dia)');
  d := replace(d, 'desde as (select (select dia from hoy) - (greatest(1, least(p_dias, 60)) - 1) as dia)',
    'desde as (select greatest(coalesce(p_desde, (select dia from hoy) - (greatest(1, least(p_dias, 60)) - 1)), (select dia from hoy) - 365) as dia)');
  d := replace(d, 'where (l.llegada + (select off from tz))::date >= (select dia from desde)',
    'where (l.llegada + (select off from tz))::date between (select dia from desde) and (select dia from hoy)');
  if position('p_desde' in d) = 0 or position('between (select dia from desde)' in d) = 0 then raise exception 'oficina_cuadre cambió'; end if;
  drop function public.oficina_cuadre(text, integer);
  execute d;

  d := pg_get_functiondef('public.oficina_por_usuario(text,integer)'::regprocedure);
  d := replace(d, 'p_dias integer DEFAULT 14)', 'p_dias integer DEFAULT 14, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)');
  d := replace(d, 'desde as (select ((((now() + (select off from tz))::date - (greatest(1, least(p_dias, 60)) - 1))::timestamp) - (select off from tz))::timestamptz as t),',
    'desde as (select ((coalesce(p_desde, (now() + (select off from tz))::date - (greatest(1, least(p_dias, 60)) - 1))::timestamp) - (select off from tz))::timestamptz as t),'
    || ' hasta as (select ((coalesce(p_hasta, (now() + (select off from tz))::date) + 1)::timestamp - (select off from tz))::timestamptz as t),');
  d := replace(d, 'and l.creado_en >= (select t from desde))', 'and l.creado_en >= (select t from desde) and l.creado_en < (select t from hasta))');
  d := replace(d, 'and o.codigo is not null and o.actualizado_en >= (select t from desde))',
    'and o.codigo is not null and o.actualizado_en >= (select t from desde) and o.actualizado_en < (select t from hasta))');
  if position('l.creado_en < (select t from hasta)' in d) = 0 or position('o.actualizado_en < (select t from hasta)' in d) = 0 then
    raise exception 'oficina_por_usuario cambió'; end if;
  drop function public.oficina_por_usuario(text, integer);
  execute d;
end $$;
revoke all on function public.oficina_cuadre(text, integer, date, date) from public, anon;
grant execute on function public.oficina_cuadre(text, integer, date, date) to authenticated;
revoke all on function public.oficina_por_usuario(text, integer, date, date) from public, anon;
grant execute on function public.oficina_por_usuario(text, integer, date, date) to authenticated;
