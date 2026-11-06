-- Un portafolio de Meta puede mandar todo su gasto a una sola tienda, sin importar el país de entrega (6-nov): A un clic
-- cuenta Guatemala, Honduras, El Salvador y Colombia en AUNCLIC_GT desde agosto. Sin tienda fija, el país escoge la tienda
-- dentro de la sociedad, como antes.
alter table public.meta_portafolios add column if not exists tienda text references public.effi_accounts (slug);
update public.meta_portafolios set tienda = 'AUNCLIC_GT' where token = 'meta_access_token_aunclic';

do $do$
declare
  d text := pg_get_functiondef('public.meta_guardar(jsonb,text[],date,date)'::regprocedure);
  v text := d;
begin
  d := replace(d, $x$a.pais = r.pais and a.tipo = 'tienda'$x$,
    $x$a.tipo = 'tienda' and coalesce(a.slug = (select p.tienda from public.meta_cuentas_ads m join public.meta_portafolios p on p.token = m.token
      where m.nombre = btrim(r.cuenta_ads) limit 1), a.pais = r.pais)$x$);
  if (length(d) - length(v)) = 0 then raise exception 'meta_guardar: no se encontró el país'; end if;
  execute d;
end $do$;
