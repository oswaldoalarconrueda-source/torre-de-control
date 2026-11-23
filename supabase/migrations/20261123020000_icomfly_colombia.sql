-- icomfly en Joalix Colombia (23-nov-2026): desde el domingo 22 los pedidos de Shopify de Colombia llegan a icomfly. El token
-- de la tienda (scripts/guardar-icomfly.sh co + push-icomfly.mjs) queda en el Vault como icomfly_token_tienda_co, e
-- icomfly-sync guarda sus pedidos en icomfly_pedidos con cuenta TIENDA_CO (sin el cruce con Drop, que es de A un clic).
do $do$
declare f text; d text; v text;
begin
  foreach f in array array['public.icomfly_guardar_token(text,text,text,jsonb)', 'public.icomfly_guardar_pedidos(text,jsonb)'] loop
    d := pg_get_functiondef(f::regprocedure);
    v := d;
    d := replace(d, $a$if p_cuenta not in ('AUNCLIC_HN', 'AUNCLIC_SV') then$a$, $a$if p_cuenta not in ('AUNCLIC_HN', 'AUNCLIC_SV', 'TIENDA_CO') then$a$);
    if d = v then raise exception '% sin la lista de tiendas', f; end if;
    execute d;
  end loop;
end $do$;
