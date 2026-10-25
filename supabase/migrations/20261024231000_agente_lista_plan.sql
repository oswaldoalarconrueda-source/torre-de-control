-- 🤖 Agente: auto_lista devuelve también la programación del país y, por orden, lo que armó la simulación.
do $$
declare def text;
begin
  select pg_get_functiondef('public.auto_lista(text, integer)'::regprocedure) into def;
  def := replace(def,
    $a$'ultimo_error', ultimo_error, 'actualizado_por', actualizado_por) from cfg)$a$,
    $b$'ultimo_error', ultimo_error, 'actualizado_por', actualizado_por, 'cada_min', cada_min, 'cortes', cortes,
       'antes_min', antes_min, 'ultima_conversion', ultima_conversion, 'error_conversion', error_conversion) from cfg)$b$);
  def := replace(def,
    $a$'decision', decision, 'decision_por', decision_por, 'decision_en', decision_en$a$,
    $b$'decision', decision, 'decision_por', decision_por, 'decision_en', decision_en,
        'plan', case when estado in ('sin_remision', 'sin_guia') then plan end,
        'plan_estado', case when estado in ('sin_remision', 'sin_guia') then plan_estado end,
        'plan_motivo', case when estado in ('sin_remision', 'sin_guia') then plan_motivo end, 'plan_en', plan_en$b$);
  def := replace(def,
    $a$'anulada', count(*) filter (where estado = 'anulada'),$a$,
    $b$'anulada', count(*) filter (where estado = 'anulada'),
        'listas', count(*) filter (where estado = 'sin_remision' and plan_estado = 'lista'),
        'plan_revision', count(*) filter (where estado = 'sin_remision' and plan_estado = 'revision'),$b$);
  if position('plan_revision' in def) = 0 or position('cortes' in def) = 0 or position('plan_motivo' in def) = 0 then
    raise exception 'auto_lista cambió: no se pudo ajustar';
  end if;
  execute def;
end $$;
