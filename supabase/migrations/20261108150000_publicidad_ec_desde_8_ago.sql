-- Ecuador: la publicidad cuenta desde el 8 de agosto de 2026 (lo pidió el dueño el 8-nov-2026 para conciliar). Sale lo
-- del 1 al 7 de agosto: $19.538.924 COP en 57 campañas.
-- La tabla mensual (respaldo de meses sin datos diarios) se compara por mes completo: un inicio a mitad de mes no borra
-- ni bloquea la fila de ese mes.
create or replace function public.publicidad_desde_inicio() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_dia date := (to_jsonb(new) ->> 'fecha')::date;
  v_mes date := (to_jsonb(new) ->> 'mes')::date;
begin
  if v_dia is not null and exists (select 1 from public.app_publicidad_inicio i where i.cuenta = new.cuenta and v_dia < i.desde) then
    return null;
  end if;
  if v_dia is null and v_mes is not null and exists (select 1 from public.app_publicidad_inicio i
      where i.cuenta = new.cuenta and v_mes < date_trunc('month', i.desde)::date) then
    return null;
  end if;
  return new;
end $$;

update public.app_publicidad_inicio set desde = '2026-08-08' where cuenta = 'TIENDA_EC';
delete from public.app_publicidad_diaria d using public.app_publicidad_inicio i where d.cuenta = i.cuenta and d.fecha < i.desde;
delete from public.app_publicidad_campanas c using public.app_publicidad_inicio i where c.cuenta = i.cuenta and c.fecha < i.desde;
delete from public.app_publicidad_mensual m using public.app_publicidad_inicio i where m.cuenta = i.cuenta and m.mes < date_trunc('month', i.desde)::date;
