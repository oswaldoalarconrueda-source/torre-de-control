-- Agente (pedido del dueño, 25-nov-2026): la orden que llega sin convenio de dropshipping toma sola el convenio que ese
-- producto usa siempre: el que lleva al menos el 95 % de sus remisiones de los últimos 30 días (mínimo 10). Si el producto
-- se reparte entre convenios (p. ej. Drenaje en Guatemala, 73 %), no se adivina: sale la ventana para escogerlo.
-- Lo usa auto-convertir (service role); devuelve {"<id artículo>": {"convenio", "nombre", "remisiones", "pct"}}.
create or replace function public.auto_convenio_por_producto(p_cuenta text)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  with x as (
    select (a->>'id')::int as art, o.rem_convenio as conv, max(o.rem_convenio_nombre) as nombre, count(*) as n
    from public.auto_ordenes o
    cross join lateral jsonb_array_elements(case when jsonb_typeof(o.articulos) = 'array' then o.articulos else '[]'::jsonb end) a
    where o.cuenta = p_cuenta and o.rem_convenio is not null and o.rem_fecha > now() - interval '30 days' and o.rem_vigente is not false
    group by 1, 2
  ), t as (
    select *, sum(n) over (partition by art) as tot, row_number() over (partition by art order by n desc) as rn from x
  )
  select coalesce(jsonb_object_agg(art::text, jsonb_build_object('convenio', conv, 'nombre', nombre, 'remisiones', n,
    'pct', round(100.0 * n / tot))), '{}'::jsonb)
  from t where rn = 1 and n >= 10 and n >= 0.95 * tot;
$function$;
revoke all on function public.auto_convenio_por_producto(text) from public, anon, authenticated;
grant execute on function public.auto_convenio_por_producto(text) to service_role;
