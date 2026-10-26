-- Disponible en oficina: observación "Otro", con lo que dijo el cliente escrito a mano (obligatorio, hasta 1.000
-- letras). Se guarda en observacion como "Otro: …".
alter table public.oficina_observaciones drop constraint oficina_observaciones_codigo_check;
alter table public.oficina_observaciones add constraint oficina_observaciones_codigo_check check (codigo in (
  'retira_fecha', 'ya_retiro', 'sin_respuesta', 'colgo', 'no_desea', 'no_puede_ahora',
  'numero_incorrecto', 'numero_ajeno', 'numero_no_disponible', 'otro'));
alter table public.oficina_observaciones add constraint oficina_obs_otro_texto
  check (codigo is distinct from 'otro' or char_length(btrim(coalesce(observacion, ''))) > char_length('Otro:'));
