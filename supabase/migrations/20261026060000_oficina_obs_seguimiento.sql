-- Disponible en oficina: observación "Hacer seguimiento", con la fecha en que el cliente pidió que lo llamen (p. ej. "llámame
-- el 31 de octubre"). Llegado ese día la guía sube arriba de la lista, mientras siga en oficina. La fecha va en
-- fecha_compromiso, igual que "retirará el…"; las estadísticas ya agrupan por código, así que no se mezclan.
alter table public.oficina_observaciones drop constraint oficina_observaciones_codigo_check;
alter table public.oficina_observaciones add constraint oficina_observaciones_codigo_check check (codigo in (
  'retira_fecha', 'seguimiento', 'ya_retiro', 'sin_respuesta', 'colgo', 'no_desea', 'no_puede_ahora',
  'numero_incorrecto', 'numero_ajeno', 'numero_no_disponible', 'otro'));
alter table public.oficina_observaciones drop constraint oficina_obs_fecha;
alter table public.oficina_observaciones add constraint oficina_obs_fecha
  check ((codigo in ('retira_fecha', 'seguimiento')) = (fecha_compromiso is not null) or codigo is null);
