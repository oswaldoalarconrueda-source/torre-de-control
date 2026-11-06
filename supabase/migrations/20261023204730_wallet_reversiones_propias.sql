-- Débito/Crédito revertido: concepto propio del PyG (skill §3), nunca mezclado con fletes ni ingresos.
create or replace function public.effi_grupo_wallet(p_t int) returns text
language sql immutable as $$
  select case when p_t in (18, 31, 36) then 'caja'
              when p_t in (34, 35) then 'reversion'
              when p_t in (1, 20, 21) then 'ingreso'
              else 'egreso' end;
$$;
