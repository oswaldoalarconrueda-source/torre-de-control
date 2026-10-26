-- La remisión de Effi a veces no trae su guía (id_guia_transporte vacío) aunque la guía exista y apunte a ella
-- (t_trans_ref 4 = remisión de venta, id_ref = la remisión). Pasó con guías hechas a mano, p. ej. Laarcourier. La Torre
-- la contaba "sin guía" (448 órdenes el 2026-10-26) y el agente podía intentar hacerle otra. Ahora la guía se toma de
-- effi_guias apenas llega, y se completan las que ya estaban.
create or replace function public.auto_guia_desde_guias() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.t_trans_ref = 4 and new.vigente is not false and new.id_ref is not null then
    update public.auto_ordenes o set id_guia = new.id, guia = new.guia
    where o.cuenta = new.cuenta and o.id_remision = new.id_ref
      and (new.sucursal_ref is null or o.sucursal_remision = new.sucursal_ref)
      and o.guia is null;
  end if;
  return new;
end $$;
create trigger effi_guias_a_auto_ordenes after insert or update of vigente, guia, id_ref on public.effi_guias
for each row execute function public.auto_guia_desde_guias();

update public.auto_ordenes o set id_guia = g.id, guia = g.guia
from public.effi_guias g
where o.guia is null and o.id_remision is not null
  and g.cuenta = o.cuenta and g.t_trans_ref = 4 and g.id_ref = o.id_remision
  and (g.sucursal_ref is null or g.sucursal_ref = o.sucursal_remision) and g.vigente is not false;
