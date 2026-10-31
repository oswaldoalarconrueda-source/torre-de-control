-- Agente más liviano (31-oct): a las 8:34 a. m. Colombia la base de datos se quedó sin conexiones y Supabase respondió
-- 521 un par de minutos. Cada pantalla del Agente pide auto_lista y auto_fabrica cada minuto y Colombia tardaba:
--  · auto_fabrica 1,9 s: buscaba la guía de cada orden por (cuenta, id) y la llave de effi_guias es
--    (cuenta, empresa, sucursal, id) → recorría las ~20.000 guías de la tienda por orden. Índice (cuenta, id): 40 ms.
--  · auto_lista 1,2 s y 5,8 MB por llamada: mandaba el plan completo (los cuerpos enviados a Effi) de las ~1.500 órdenes
--    de 3 días, también las ya terminadas, y revisaba la condición de ciudad de todas.
-- Ahora las órdenes terminadas llevan solo lo que muestra la tabla (como el historial) y la condición solo se busca en
-- las pendientes; auto_restriccion normaliza ciudad, departamento y dirección una sola vez por llamada.
create index if not exists effi_guias_cuenta_id on public.effi_guias (cuenta, id);
create index if not exists effi_guias_cuenta_cliente on public.effi_guias (cuenta, upper(regexp_replace(nombre_destinatario, '^\*+\s*', '')), fecha_trans);

create or replace function public.auto_restriccion(p_cuenta text, p_ciudad text, p_dpto text, p_direccion text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('tipo', r.tipo, 'motivo', r.motivo, 'lugar', r.lugar, 'transportadora', r.transportadora)
  from (select public.auto_clave(p_ciudad) as c, public.auto_clave(p_dpto) as dp, public.auto_clave(p_direccion) as d) k,
       public.auto_restricciones r
  where r.cuenta = p_cuenta
    and (r.dpto is null or k.dp like r.dpto || '%')
    and (k.c = any (r.ciudades)
      or (r.palabra is not null and k.d like '%' || r.palabra || '%' and (r.en_ciudades is null or k.c = any (r.en_ciudades))))
  order by (k.c = any (r.ciudades)) desc, (r.tipo = 'transportadora_fija'), r.id
  limit 1;
$$;

do $$
declare d text := pg_get_functiondef('public.auto_lista(text,integer,date,date)'::regprocedure);
begin
  if position('plan_liviano' in d) = 0 then
    d := replace(d, $q$'restriccion', public.auto_restriccion(cuenta, ciudad, provincia, coalesce(plan->'remision'->>'direccion_cliente', plan->'guia'->'direccion_destinatario'->>0)),$q$,
      $q$'restriccion', case when estado in ('sin_remision', 'sin_guia', 'revision') or plan_estado in ('lista', 'revision', 'error')
          then public.auto_restriccion(cuenta, ciudad, provincia, coalesce(plan->'remision'->>'direccion_cliente', plan->'guia'->'direccion_destinatario'->>0)) end,$q$);
    -- plan_liviano: terminadas (completa, anulada, resuelta) sin error ni revisión pendiente.
    d := replace(d, $q$'plan', plan,$q$,
      $q$'plan', case when plan is not null and estado in ('completa', 'anulada', 'resuelta') and plan_estado is distinct from 'error'
          then jsonb_strip_nulls(jsonb_build_object( -- plan_liviano
            'resumen', plan->'resumen', 'remision_existente', plan->'remision_existente',
            'remision', case when plan ? 'remision' then jsonb_build_object('direccion_cliente', plan->'remision'->'direccion_cliente') end,
            'guia', case when plan ? 'guia' then jsonb_build_object('direccion_destinatario', plan->'guia'->'direccion_destinatario') end,
            'resultado', case when plan ? 'resultado' then jsonb_build_object(
              'remision', jsonb_build_object('id', plan->'resultado'->'remision'->'id', 'id_transaccion', plan->'resultado'->'remision'->'id_transaccion'),
              'guia', jsonb_build_object('guia', plan->'resultado'->'guia'->'guia')) end))
          else plan end,$q$);
    if position('plan_liviano' in d) = 0 or position($q$estado in ('sin_remision', 'sin_guia', 'revision')$q$ in d) = 0 then
      raise exception 'auto_lista cambió: no se pudo aligerar';
    end if;
    execute d;
  end if;
end $$;
