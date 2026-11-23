-- ValerIA (23-nov-2026): una remisión de Colombia por el centro Shopify quedaba «en revisión» y no salía en ninguna lista
-- (ni en Remisiones pendientes por guía): auto_lista la marcaba con «Cliente sin * y la remisión va por Shopify» y, si la
-- orden venía sin convenio aunque la remisión sí lo llevara, con «La orden no trae convenio». Desde el 21-nov los centros
-- Shopify, Shopify sin confirmar y Carritos son válidos, y si la remisión lleva convenio la guía ya tiene su remitente.
do $do$
declare d text := pg_get_functiondef('public.auto_lista(text,integer,date,date,boolean)'::regprocedure); v text := d;
begin
  d := replace(d, $a$        case when b.convenio_orden is null then 'La orden no trae convenio' end,$a$,
    $a$        case when b.convenio_orden is null and b.rem_convenio is null then 'La orden no trae convenio' end,$a$);
  if d = v then raise exception 'auto_lista: convenio'; end if;
  v := d;
  d := replace(d, $a$        case when b.id_remision is not null and b.rem_centro is not null and b.rem_centro <> b.centro_esperado then$a$,
    $a$        case when b.id_remision is not null and b.rem_centro is not null and b.rem_centro <> b.centro_esperado
                  and coalesce(b.rem_centro_nombre, '') !~* '^(shopify|carritos)' then$a$);
  if d = v then raise exception 'auto_lista: centro'; end if;
  execute d;
end $do$;
