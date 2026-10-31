-- Transportadora fija por ciudad (31-oct): las asesoras logísticas mandaron 38 ciudades de Colombia con la
-- transportadora que debe llevar el pedido ("TRANSPORTADORAS FIJAS PARA DESTINOS.xlsx"). Regla del dueño: en esas
-- ciudades ValerIA propone esa transportadora en "Ejecutar", pero la orden se hace manual (no va sola aunque la matriz
-- coincida). Excepción: la entrega en oficina de Inter o Servientrega sigue yendo sola por la transportadora de la oficina.
-- Va como una condición más de auto_restricciones (tipo 'transportadora_fija') con la transportadora en su columna.
alter table public.auto_restricciones add column if not exists transportadora integer;
alter table public.auto_restricciones drop constraint if exists auto_restricciones_tipo_check;
alter table public.auto_restricciones add constraint auto_restricciones_tipo_check check (tipo = any (array[
  'anticipado', 'anticipado_flete', 'sin_cobertura', 'flete_alto', 'solo_envia', 'inter_oficina', 'validar', 'trato_especial',
  'transportadora_fija']));

-- La condición que se muestra: si la ciudad tiene otra condición (pago anticipado, flete alto…), esa va primero.
create or replace function public.auto_restriccion(p_cuenta text, p_ciudad text, p_dpto text, p_direccion text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('tipo', r.tipo, 'motivo', r.motivo, 'lugar', r.lugar, 'transportadora', r.transportadora)
  from public.auto_restricciones r
  where r.cuenta = p_cuenta
    and (r.dpto is null or public.auto_clave(p_dpto) like r.dpto || '%')
    and (public.auto_clave(p_ciudad) = any (r.ciudades)
      or (r.palabra is not null and public.auto_clave(p_direccion) like '%' || r.palabra || '%'
          and (r.en_ciudades is null or public.auto_clave(p_ciudad) = any (r.en_ciudades))))
  order by (public.auto_clave(p_ciudad) = any (r.ciudades)) desc, (r.tipo = 'transportadora_fija'), r.id
  limit 1;
$$;

-- La transportadora fija de una ciudad (para que ValerIA la proponga), aunque la ciudad tenga además otra condición.
create or replace function public.auto_transportadora_fija(p_cuenta text, p_ciudad text, p_dpto text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.transportadora, 'lugar', r.lugar)
  from public.auto_restricciones r
  where r.cuenta = p_cuenta and r.tipo = 'transportadora_fija' and r.transportadora is not null
    and (r.dpto is null or public.auto_clave(p_dpto) like r.dpto || '%')
    and public.auto_clave(p_ciudad) = any (r.ciudades)
  order by r.id desc
  limit 1;
$$;
revoke all on function public.auto_transportadora_fija(text, text, text) from public, anon, authenticated;

-- Las 38 ciudades del Excel (1 Envía · 4 Interrapidísimo · 6 Servientrega). Ciénega (Boyacá) decía "Inter-Servientrega":
-- va Servientrega (100 % de entrega en la matriz). Ibagué cambia de Servientrega a Envía y Melgar va por Inter aunque el
-- resto del Tolima vaya por Envía.
insert into public.auto_restricciones (cuenta, dpto, ciudades, tipo, motivo, lugar, transportadora)
select 'TIENDA_CO', v.dpto, v.ciudades, 'transportadora_fija',
  'Transportadora fija: ' || case v.t when 1 then 'Envía' when 4 then 'Interrapidísimo' else 'Servientrega' end || ' (se hace manual)',
  v.lugar, v.t
from (values
  ('ANTIOQUIA', array['APARTADO'], 'Antioquia · Apartadó', 4),
  ('BOYACA', array['CIENEGA'], 'Boyacá · Ciénega', 6),
  ('BOYACA', array['RAMIRIQUI'], 'Boyacá · Ramiriquí', 4),
  ('CASANARE', array['MONTERREY'], 'Casanare · Monterrey', 4),
  ('CAUCA', array['POPAYAN'], 'Cauca · Popayán', 6),
  ('CUNDINAMARCA', array['APULO'], 'Cundinamarca · Apulo', 4),
  ('CUNDINAMARCA', array['FOMEQUE'], 'Cundinamarca · Fómeque', 4),
  ('CUNDINAMARCA', array['LENGUAZAQUE'], 'Cundinamarca · Lenguazaque', 4),
  ('HUILA', array['NEIVA'], 'Huila · Neiva', 6),
  ('HUILA', array['RIVERA'], 'Huila · Rivera', 4),
  ('META', array['GUAMAL'], 'Meta · Guamal', 4),
  ('NARINO', array['CUMBAL'], 'Nariño · Cumbal', 4),
  ('NARINO', array['LACRUZ'], 'Nariño · La Cruz', 4),
  ('PUTUMAYO', array['MOCOA'], 'Putumayo · Mocoa', 6),
  ('RISARALDA', array['MISTRATO'], 'Risaralda · Mistrató', 4),
  ('TOLIMA', array['IBAGUE'], 'Tolima · Ibagué', 1),
  ('VALLEDELCAUCA', array['ANDALUCIA'], 'Valle del Cauca · Andalucía', 4),
  ('VALLEDELCAUCA', array['GUADALAJARADEBUGA', 'BUGA'], 'Valle del Cauca · Guadalajara de Buga', 1),
  ('VALLEDELCAUCA', array['YUMBO'], 'Valle del Cauca · Yumbo', 1),
  ('BOLIVAR', array['CARTAGENA', 'CARTAGENADEINDIAS'], 'Bolívar · Cartagena', 1),
  ('CESAR', array['VALLEDUPAR'], 'Cesar · Valledupar', 1),
  ('META', array['VILLAVICENCIO'], 'Meta · Villavicencio', 1),
  ('RISARALDA', array['PEREIRA'], 'Risaralda · Pereira', 1),
  ('SANTANDER', array['BARRANCABERMEJA'], 'Santander · Barrancabermeja', 6),
  ('BOLIVAR', array['CLEMENCIA'], 'Bolívar · Clemencia', 4),
  ('BOYACA', array['PUERTOBOYACA'], 'Boyacá · Puerto Boyacá', 4),
  ('CORDOBA', array['MONTELIBANO'], 'Córdoba · Montelíbano', 4),
  ('CORDOBA', array['PLANETARICA'], 'Córdoba · Planeta Rica', 4),
  ('NORTEDESANTANDER', array['LOSPATIOS'], 'Norte de Santander · Los Patios', 4),
  ('TOLIMA', array['MELGAR'], 'Tolima · Melgar', 4),
  ('QUINDIO', array['ARMENIA'], 'Quindío · Armenia', 1),
  ('RISARALDA', array['PUEBLORICO'], 'Risaralda · Pueblo Rico', 4),
  ('CAUCA', array['SANTANDERDEQUILICHAO'], 'Cauca · Santander de Quilichao', 4),
  ('CASANARE', array['PORE'], 'Casanare · Pore', 4),
  ('ANTIOQUIA', array['LACEJA'], 'Antioquia · La Ceja', 4),
  ('ANTIOQUIA', array['MARINILLA'], 'Antioquia · Marinilla', 4),
  ('CUNDINAMARCA', array['FUNZA'], 'Cundinamarca · Funza', 1),
  ('BOLIVAR', array['CANTAGALLO'], 'Bolívar · Cantagallo', 4)
) as v(dpto, ciudades, lugar, t)
where not exists (select 1 from public.auto_restricciones x where x.cuenta = 'TIENDA_CO' and x.tipo = 'transportadora_fija' and x.lugar = v.lugar);
