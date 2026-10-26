-- Disponible en oficina: quién hizo qué (solo el dueño). Por usuario, en los últimos días: contactos marcados y su
-- resultado, y observaciones (gestiones) puestas. Cada contacto y observación ya guarda el correo de quien la llenó.
create or replace function public.oficina_por_usuario(p_cuenta text, p_dias integer default 14)
returns jsonb language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  with permitido as (select public.app_es_owner() and p_cuenta = any (public.app_cuentas_visibles('oficina')) as ok),
  tz as (select make_interval(mins => tz_offset_min) as off from public.effi_accounts where slug = p_cuenta),
  desde as (select ((((now() + (select off from tz))::date - (greatest(1, least(p_dias, 60)) - 1))::timestamp) - (select off from tz))::timestamptz as t),
  hoy as (select (((now() + (select off from tz))::date)::timestamp - (select off from tz))::timestamptz as t),
  ll as (select l.* from public.oficina_llamadas l where l.cuenta = p_cuenta and (select ok from permitido) and l.creado_en >= (select t from desde)),
  ob as (select o.* from public.oficina_observaciones o where o.cuenta = p_cuenta and (select ok from permitido)
           and o.codigo is not null and o.actualizado_en >= (select t from desde)),
  quienes as (select usuario_email from ll union select usuario_email from ob)
  select coalesce(jsonb_agg(jsonb_build_object(
    'email', q.usuario_email,
    'nombre', coalesce((select u.nombre from public.app_usuarios u where u.email = q.usuario_email), split_part(q.usuario_email, '@', 1)),
    'contactos', (select count(*) from ll where ll.usuario_email = q.usuario_email),
    'contactos_hoy', (select count(*) from ll where ll.usuario_email = q.usuario_email and ll.creado_en >= (select t from hoy)),
    'contactados', (select count(*) from ll where ll.usuario_email = q.usuario_email and ll.resultado = 'contesto'),
    'no_contesta', (select count(*) from ll where ll.usuario_email = q.usuario_email and ll.resultado = 'no_contesto'),
    'no_aplica', (select count(*) from ll where ll.usuario_email = q.usuario_email and ll.resultado = 'telefono_malo'),
    'guias', (select count(distinct ll.guia) from ll where ll.usuario_email = q.usuario_email),
    'gestiones', (select count(*) from ob where ob.usuario_email = q.usuario_email),
    'gestiones_hoy', (select count(*) from ob where ob.usuario_email = q.usuario_email and ob.actualizado_en >= (select t from hoy))
  ) order by q.usuario_email), '[]'::jsonb)
  from quienes q where q.usuario_email is not null;
$$;
revoke all on function public.oficina_por_usuario(text, integer) from public, anon;
grant execute on function public.oficina_por_usuario(text, integer) to authenticated;
