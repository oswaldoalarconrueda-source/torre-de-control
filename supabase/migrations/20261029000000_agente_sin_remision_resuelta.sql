-- Una orden sin remisión ya está resuelta cuando el cliente tiene una guía vigente hecha después de la orden: el pedido
-- salió con otra orden (duplicada) o la remisión recién creada aún no llega con la sincronización. Pasa a 'completa' y
-- sale de "Órdenes sin remisión" sin que nadie la toque (misma regla que ya se usaba para la remisión anulada).
do $$
declare d text := pg_get_functiondef('public.auto_lista(text,integer)'::regprocedure);
begin
  if position('resuelta con otra guía' in d) = 0 then
    d := replace(d, $q$when m.id_remision is null then 'sin_remision'$q$,
      $q$when m.id_remision is null and exists ( -- resuelta con otra guía
             select 1 from public.effi_guias g
             where g.cuenta = m.cuenta and g.vigente is distinct from false and g.fecha_trans >= m.fecha_orden - interval '1 hour'
               and upper(regexp_replace(g.nombre_destinatario, '^\*+\s*', '')) = upper(regexp_replace(m.cliente, '^\*+\s*', ''))) then 'completa'
           when m.id_remision is null then 'sin_remision'$q$);
    if position('resuelta con otra guía' in d) = 0 then raise exception 'auto_lista cambió: no se pudo agregar la regla'; end if;
    execute d;
  end if;
end $$;
