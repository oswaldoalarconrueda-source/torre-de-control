-- Cada portafolio de Meta puede tener fecha de inicio (6-nov): lo anterior no es de esa sociedad y no se guarda. A un clic
-- es sociedad desde agosto de 2026.
alter table public.meta_portafolios add column if not exists desde date;
insert into public.meta_portafolios (token, sociedad, desde) values ('meta_access_token_aunclic', 'A un clic', '2026-08-01')
on conflict (token) do update set sociedad = excluded.sociedad, desde = excluded.desde;

do $do$
declare
  d text := pg_get_functiondef('public.meta_guardar(jsonb,text[],date,date)'::regprocedure);
  v text := d;
begin
  d := replace(d, $x$where r.fecha between p_desde and p_hasta$x$,
    $x$where r.fecha between p_desde and p_hasta
    and r.fecha >= coalesce((select p.desde from public.meta_cuentas_ads m join public.meta_portafolios p on p.token = m.token
      where m.nombre = btrim(r.cuenta_ads) limit 1), r.fecha)$x$);
  if d = v then raise exception 'meta_guardar: no se encontró el filtro de fechas'; end if;
  execute d;
end $do$;
