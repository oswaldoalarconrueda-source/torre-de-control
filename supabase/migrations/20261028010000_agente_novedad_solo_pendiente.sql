-- Agente · "Novedad en la orden": solo lo que sigue pendiente (pedido del dueño, 28-oct). Una orden ya no es novedad si:
-- 1. ya tiene guía con su remisión vigente (se despachó; lo que se anotó —convenio, centro de costos— ya no se corrige), o
-- 2. su remisión fue anulada (p. ej. el proveedor rechazó el dropshipping) pero después se le hizo una guía vigente al
--    mismo cliente (se corrigió por otro lado: otro proveedor u otra remisión).
-- Lo demás con motivos sigue en "revision".
do $$
declare v_def text; v_viejo text; v_nuevo text;
begin
  v_def := pg_get_functiondef('public.auto_lista(text, integer)'::regprocedure);
  v_viejo := $v$           when m.id_remision is null then 'sin_remision'
           when cardinality(m.motivos) > 0 then 'revision'$v$;
  v_nuevo := $v$           when m.id_remision is null then 'sin_remision'
           when m.guia is not null and m.rem_vigente is not false then 'completa'
           when m.rem_vigente = false and exists (
             select 1 from public.effi_guias g
             where g.cuenta = m.cuenta and g.vigente is distinct from false and g.fecha_trans >= m.fecha_orden - interval '1 hour'
               and upper(regexp_replace(g.nombre_destinatario, '^\*+\s*', '')) = upper(regexp_replace(m.cliente, '^\*+\s*', ''))) then 'completa'
           when cardinality(m.motivos) > 0 then 'revision'$v$;
  if position(v_viejo in v_def) = 0 then raise exception 'auto_lista cambió: no se encontró el bloque del estado'; end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
