-- 🤖 Agente: al entrar muestra el mes en curso, para que no quede nada pendiente de ayer ni de días anteriores (pedido del
-- dueño, 11-nov-2026). Para que no pese (Colombia tiene ~9.000 órdenes al mes), con p_solo_abiertas la lista devuelve solo
-- las órdenes que siguen abiertas (sin remisión, sin guía, en revisión o con error) más todas las de hoy; el resumen sigue
-- contando todo. La ventana en días pasa de 30 a 31 como máximo (el día 31 del mes).
do $$
declare d text := pg_get_functiondef('public.auto_lista(text,integer,date,date)'::regprocedure);
begin
  if position('p_solo_abiertas' in d) > 0 then return; end if;
  d := replace(d, 'p_hasta date DEFAULT NULL::date)', 'p_hasta date DEFAULT NULL::date, p_solo_abiertas boolean DEFAULT false)');
  d := replace(d, 'least(p_dias, 30)', 'least(p_dias, 31)');
  d := replace(d, 'order by fecha_orden desc) from e)',
    'order by fecha_orden desc) from e where not p_solo_abiertas or estado not in (''completa'', ''anulada'') '
    || 'or (fecha_orden + make_interval(mins => (select tz_offset_min from tz)))::date = (now() + make_interval(mins => (select tz_offset_min from tz)))::date)');
  if position('p_solo_abiertas or estado' in d) = 0 then raise exception 'auto_lista cambió: no se pudo agregar p_solo_abiertas'; end if;
  drop function public.auto_lista(text, integer, date, date);
  execute d;
end $$;
revoke all on function public.auto_lista(text, integer, date, date, boolean) from public, anon;
grant execute on function public.auto_lista(text, integer, date, date, boolean) to authenticated, service_role;

do $$
declare d text := pg_get_functiondef('public.auto_ordenes_extra(text,integer)'::regprocedure);
begin
  if position('least(p_dias, 31)' in d) > 0 then return; end if;
  execute replace(d, 'least(p_dias, 30)', 'least(p_dias, 31)');
end $$;
