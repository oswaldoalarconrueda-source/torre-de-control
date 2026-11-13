-- 🤖 Agente: ciudades con deficiencia en entregas (pedido del dueño, 12-nov-2026, desde "Ciudades con peor efectividad").
-- Ahí no se envía contra entrega: solo con anticipo / pago anticipado o si el cliente ya nos compró antes. El agente no
-- crea esas órdenes: van al filtro "Deficiencia en entregas" de ValerIA y las atiende una persona.
-- San Rafael de Chucurí estaba en "Validar con el cliente": pasa a esta condición.
alter table public.auto_restricciones drop constraint if exists auto_restricciones_tipo_check;
alter table public.auto_restricciones add constraint auto_restricciones_tipo_check check (tipo = any (array['anticipado', 'anticipado_flete',
  'sin_cobertura', 'flete_alto', 'solo_envia', 'inter_oficina', 'validar', 'trato_especial', 'transportadora_fija', 'revision',
  'deficiencia_entregas']));
update public.auto_restricciones
set tipo = 'deficiencia_entregas', motivo = 'Deficiencia en entregas: solo con pago anticipado o si el cliente ya nos compró'
where cuenta = 'TIENDA_CO' and id = 102 and tipo = 'validar';

insert into public.auto_restricciones (cuenta, dpto, ciudades, tipo, motivo, lugar)
select x.cuenta, x.dpto, x.ciudades, 'deficiencia_entregas',
  'Deficiencia en entregas: solo con pago anticipado o si el cliente ya nos compró', x.lugar
from (values
  ('TIENDA_CO', 'ANTIOQUIA', array['SANROQUE'], 'Antioquia · San Roque'),
  ('TIENDA_CO', 'BOLIVAR', array['SANTAROSASANTAROSADELIMA', 'SANTAROSADELIMA', 'MARIALABAJA'], 'Bolívar · Santa Rosa de Lima y María la Baja'),
  ('TIENDA_CO', 'TOLIMA', array['ORTEGA'], 'Tolima · Ortega'),
  ('TIENDA_CO', 'CESAR', array['LALOMAELPASO', 'LALOMA', 'PELAYA'], 'Cesar · La Loma (El Paso) y Pelaya'),
  ('TIENDA_CO', 'NARINO', array['TUMACO', 'SANANDRESDETUMACO'], 'Nariño · Tumaco'),
  ('TIENDA_CO', 'CORDOBA', array['LAAPARTADA', 'CHINU'], 'Córdoba · La Apartada y Chinú'),
  ('TIENDA_EC', 'GUAYAS', array['COLIMES'], 'Guayas · Colimes'),
  ('TIENDA_EC', 'PASTAZA', array['MERA'], 'Pastaza · Mera'),
  ('TIENDA_GT', 'SANMARCOS', array['MALACATANAGENCIACAEXMALACATAN'], 'San Marcos · Malacatán (Agencia Caex)'),
  ('TIENDA_GT', 'QUICHE', array['SACAPULAS'], 'Quiché · Sacapulas')
) x(cuenta, dpto, ciudades, lugar)
where not exists (select 1 from public.auto_restricciones r where r.cuenta = x.cuenta and r.tipo = 'deficiencia_entregas' and r.lugar = x.lugar);

-- Como el trato especial: la orden lista no se pasa a remisión sola, queda en revisión con el motivo.
create or replace function public.auto_trato_especial() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if new.plan_estado = 'lista' and new.id_remision is null then
    r := public.auto_restriccion(new.cuenta, coalesce(new.ciudad, ''), coalesce(new.provincia, ''),
      coalesce(new.plan->'remision'->>'direccion_cliente', ''));
    if r->>'tipo' = 'trato_especial' then
      new.plan_estado := 'revision';
      new.plan_motivo := 'Trato especial (' || (r->>'lugar') || '): no se pasa a remisión, la maneja una persona';
    elsif r->>'tipo' = 'deficiencia_entregas' then
      new.plan_estado := 'revision';
      new.plan_motivo := 'Deficiencia en entregas (' || (r->>'lugar') || '): solo con pago anticipado o si el cliente ya nos compró; la atiende una persona';
    end if;
  end if;
  return new;
end $$;
