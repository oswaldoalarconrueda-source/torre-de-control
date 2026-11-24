-- Pedido del dueño (24-nov-2026): en todo el Centro de Control la otra plataforma de Joalix se llama «Others» (antes «O.A.»)
-- y el filtro dice «Todo · Effi · Others». En A un clic sigue con su nombre real (Dropi, Smart, Drop).
create or replace function public.plataforma_etiqueta(p_cuenta text, pl text)
returns text
language sql
stable
as $function$
  select case pl when 'smart' then 'Smart' when 'drop' then 'Drop'
    else case when (select sociedad from public.effi_accounts where slug = p_cuenta) = 'A un clic' then 'Dropi' else 'Others' end end
$function$;
