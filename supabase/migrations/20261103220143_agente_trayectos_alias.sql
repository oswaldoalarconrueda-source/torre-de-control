create or replace function public.auto_tray_clave(t text) returns text language sql immutable set search_path = '' as $$
  select case c when 'GUADALAJARA DE BUGA' then 'BUGA' when 'EL ESPINAL' then 'ESPINAL' else c end
  from (select regexp_replace(trim(regexp_replace(regexp_replace(public.auto_norm(t), '\(.*?\)', ' ', 'g'), '[.,_-]+', ' ', 'g')), '(\s+D\s*C)$|\s+(?=\s)', '', 'g') c) x;
$$;
