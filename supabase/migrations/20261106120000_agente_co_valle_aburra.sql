-- Regla del dueño (5-nov): en Colombia no se crea sola la remisión para Medellín, Bello, Envigado, Sabaneta, La Estrella e
-- Itagüí; el agente prepara la orden y la deja con el aviso para que la revise una persona (desde "Ejecutar"). Va como
-- condición de envío nueva, "revision", que no tiene excepción (ni entrega en oficina ni transportadora fija).
alter table public.auto_restricciones drop constraint if exists auto_restricciones_tipo_check;
alter table public.auto_restricciones add constraint auto_restricciones_tipo_check check (tipo = any (array[
  'anticipado', 'anticipado_flete', 'sin_cobertura', 'flete_alto', 'solo_envia', 'inter_oficina', 'validar', 'trato_especial',
  'transportadora_fija', 'revision']));
insert into public.auto_restricciones (cuenta, dpto, ciudades, tipo, motivo, lugar)
values ('TIENDA_CO', 'ANTIOQUIA', array['MEDELLIN', 'BELLO', 'ENVIGADO', 'SABANETA', 'LAESTRELLA', 'ITAGUI'], 'revision',
  'La revisa una persona: no se crea sola (Valle de Aburrá)', 'Antioquia · Valle de Aburrá');
