-- Gasto de Meta por sociedad (6-nov): cada token (portafolio) dice de qué sociedad son sus cuentas; el que no está en la
-- tabla sigue siendo de Joalix. El país de entrega escoge la tienda dentro de esa sociedad. Valka (portafolio VALKA GT 1)
-- va a VALKA_GT; si una cuenta de Valka anuncia en un país donde Valka no tiene tienda, ese gasto no se cuenta.
create table if not exists public.meta_portafolios (
  token text primary key,
  sociedad text not null
);
alter table public.meta_portafolios enable row level security;
insert into public.meta_portafolios (token, sociedad) values ('meta_access_token_valka', 'Valka')
on conflict (token) do update set sociedad = excluded.sociedad;

do $do$
declare
  d text := pg_get_functiondef('public.meta_guardar(jsonb,text[],date,date)'::regprocedure);
  v text := d;
begin
  d := replace(d, $x$a.sociedad = 'Joalix AA Group'$x$,
    $x$a.sociedad = coalesce((select p.sociedad from public.meta_cuentas_ads m join public.meta_portafolios p on p.token = m.token
      where m.nombre = btrim(r.cuenta_ads) limit 1), 'Joalix AA Group')$x$);
  if d = v then raise exception 'meta_guardar: no se encontró la sociedad fija'; end if;
  v := d;
  d := replace(d, 'as r(pais text) join', 'as r(pais text, cuenta_ads text) join');
  if d = v then raise exception 'meta_guardar: no se encontró el conteo de omitidas'; end if;
  execute d;
end $do$;
