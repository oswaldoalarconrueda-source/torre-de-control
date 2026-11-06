-- Publicidad (pedido del dueño, 6-nov): el bloque de conexión (portafolios y cuentas sin gasto) muestra solo los
-- portafolios de la sociedad que se está mirando; el gasto ya venía filtrado por sus tiendas. La sociedad de cada
-- portafolio sale de meta_portafolios (si no está, Joalix).
do $do$
declare
  d text := pg_get_functiondef('public.publicidad_resumen(text[],date,date)'::regprocedure);
  v text := d;
begin
  d := replace(d, $x$  api as (select nombre, token, ultima_sync, ultimo_error, estado, divisa from public.meta_cuentas_ads),$x$,
    $x$  api as (select nombre, token, ultima_sync, ultimo_error, estado, divisa from public.meta_cuentas_ads),
  soc as (select distinct a.sociedad from public.effi_accounts a join vis on vis.slug = a.slug),
  mia as (
    select m.* from public.meta_cuentas_ads m
    where coalesce((select p.sociedad from public.meta_portafolios p where p.token = coalesce(m.token, 'meta_access_token')), 'Joalix AA Group')
          in (select sociedad from soc)
  ),$x$);
  if d = v then raise exception 'publicidad_resumen: no se encontró api'; end if;
  v := d;
  d := replace(d, $x$from public.meta_cuentas_ads where not excluir group by 1) x)$x$, $x$from mia where not excluir group by 1) x)$x$);
  if d = v then raise exception 'publicidad_resumen: no se encontraron los portafolios'; end if;
  v := d;
  d := replace(d, $x$select a.nombre, a.token as portafolio, a.estado, a.divisa from public.meta_cuentas_ads a$x$,
    $x$select a.nombre, a.token as portafolio, a.estado, a.divisa from mia a$x$);
  if d = v then raise exception 'publicidad_resumen: no se encontraron las cuentas sin gasto'; end if;
  execute d;
end $do$;
