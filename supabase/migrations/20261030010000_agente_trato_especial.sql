-- Condición "trato especial" (Ecuador, 30-oct): las órdenes a La Concordia, Buena Fe y Taisha salen con aviso en el
-- agente pero no se pasan a remisión (ni solas en automático ni con "Ejecutar"): las maneja una persona.
alter table public.auto_restricciones drop constraint if exists auto_restricciones_tipo_check;
alter table public.auto_restricciones add constraint auto_restricciones_tipo_check
  check (tipo in ('anticipado', 'anticipado_flete', 'sin_cobertura', 'flete_alto', 'solo_envia', 'inter_oficina', 'validar', 'trato_especial'));

insert into public.auto_restricciones (cuenta, dpto, ciudades, tipo, motivo, lugar)
select * from (values
  ('TIENDA_EC', null::text, array['LACONCORDIA'], 'trato_especial', 'Trato especial: no pasar a remisión', 'La Concordia'),
  ('TIENDA_EC', 'LOSRIOS', array['BUENAFE', 'BUENAFESANJACINTODEBUENAFE', 'SANJACINTODEBUENAFE'], 'trato_especial', 'Trato especial: no pasar a remisión', 'Los Ríos · Buena Fe'),
  ('TIENDA_EC', 'MORONASANTIAGO', array['TAISHA'], 'trato_especial', 'Trato especial: no pasar a remisión', 'Morona Santiago · Taisha')
) v(cuenta, dpto, ciudades, tipo, motivo, lugar)
where not exists (select 1 from public.auto_restricciones r where r.cuenta = v.cuenta and r.lugar = v.lugar);

-- Una orden sin remisión en una ciudad con trato especial nunca queda "lista": pasa a revisión con el aviso. Así el
-- agente (que solo crea lo que está lista) y "Ejecutar" (que pide lista o error) no la convierten.
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
    end if;
  end if;
  return new;
end $$;
drop trigger if exists auto_trato_especial on public.auto_ordenes;
create trigger auto_trato_especial before insert or update on public.auto_ordenes
  for each row execute function public.auto_trato_especial();

-- Las que ya estaban listas pasan por la regla.
update public.auto_ordenes set plan_estado = plan_estado
where cuenta = 'TIENDA_EC' and plan_estado = 'lista' and id_remision is null;
