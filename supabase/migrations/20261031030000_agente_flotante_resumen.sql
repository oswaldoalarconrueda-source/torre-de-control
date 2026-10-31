-- Burbuja del Agente (31-oct): auto_flotante llamaba auto_lista completa de cada tienda (~3 MB en Colombia) solo para
-- quedarse con el resumen, por cada usuario cada 2 minutos (cada 20 s con la burbuja abierta) en todas las páginas.
-- Ahora auto_lista no arma la lista de órdenes cuando la sesión pide solo el resumen (torre.solo_resumen = '1').
do $$
declare d text := pg_get_functiondef('public.auto_lista(text,integer,date,date)'::regprocedure);
begin
  if position('torre.solo_resumen' in d) = 0 then
    d := replace(d, $q$'ordenes', coalesce((select jsonb_agg($q$,
      $q$'ordenes', case when current_setting('torre.solo_resumen', true) = '1' then '[]'::jsonb else coalesce((select jsonb_agg($q$);
    d := replace(d, $q$from e), '[]'::jsonb)$q$, $q$from e), '[]'::jsonb) end$q$);
    if position('torre.solo_resumen' in d) = 0 or position($q$'[]'::jsonb) end$q$ in d) = 0 then
      raise exception 'auto_lista cambió: no se pudo agregar el modo resumen';
    end if;
    execute d;
  end if;
end $$;

create or replace function public.auto_flotante()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r jsonb;
begin
  perform set_config('torre.solo_resumen', '1', true);
  select coalesce(jsonb_agg(jsonb_build_object(
    'cuenta', c.cuenta,
    'modo', c.modo,
    'corriendo', c.corriendo_hasta is not null and c.corriendo_hasta > now(),
    'ultima_corrida', c.ultima_corrida,
    'resumen', public.auto_lista(c.cuenta, 3) -> 'resumen',
    'errores_hoy', (
      select count(distinct e.id_orden) from public.auto_eventos e
      where e.cuenta = c.cuenta and e.ok is false and e.id_orden is not null
        and e.creado_en >= (((now() + make_interval(mins => a.tz_offset_min))::date)::timestamp - make_interval(mins => a.tz_offset_min))::timestamptz
        and not exists (select 1 from public.auto_ordenes o where o.cuenta = e.cuenta and o.id = e.id_orden and o.guia is not null))
  ) order by c.cuenta), '[]'::jsonb) into r
  from public.auto_config c
  join public.effi_accounts a on a.slug = c.cuenta and a.activa
  where c.cuenta = any (public.app_cuentas_visibles('automatizacion'));
  perform set_config('torre.solo_resumen', '', true);
  return r;
end $$;
