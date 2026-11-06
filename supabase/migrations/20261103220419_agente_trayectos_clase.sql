create or replace function public.auto_tray_clase(p_transportadora integer, p_tipo text) returns text language sql immutable set search_path = '' as $$
  select case
    when p_tipo in ('U', 'LOCAL', 'URBANO') then 'local'
    when p_tipo in ('R', 'REGIONAL') then 'regional'
    when p_tipo in ('N', 'NACIONAL') then 'nacional'
    else 'otro' end;
$$;
