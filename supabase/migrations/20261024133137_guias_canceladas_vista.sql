do $$
declare def text := pg_get_viewdef('public.v_guias'::regclass);
begin
  if position('''EXCLUIDA''::text' in def) = 0 then raise exception 'v_guias ya no tiene EXCLUIDA'; end if;
  execute 'create or replace view public.v_guias with (security_invoker = true) as '
    || replace(def, '''EXCLUIDA''::text', '''CANCELADA''::text');
end $$;

refresh materialized view public.effi_mv_dia;
refresh materialized view public.effi_mv_dia_dim;
refresh materialized view public.effi_mv_ciudad;
