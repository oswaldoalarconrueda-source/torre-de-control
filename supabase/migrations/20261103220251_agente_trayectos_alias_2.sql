create or replace function public.auto_tray_clave(t text) returns text language sql immutable set search_path = '' as $$
  select case c when 'GUADALAJARA DE BUGA' then 'BUGA' when 'EL ESPINAL' then 'ESPINAL' when 'SANTA FE DE ANTIOQUIA' then 'SANTAFE DE ANTIOQUIA'
    when 'VISTA HERMOSA' then 'VISTAHERMOSA' when 'CALIMA EL DARIEN' then 'CALIMA DARIEN' when 'SAN MARTIN DE LOS LLANOS' then 'SAN MARTIN'
    when 'EL PENOL' then 'PENOL' when 'EL RETIRO' then 'RETIRO' when 'MUNICIPIO DE SOPO' then 'SOPO' when 'SAN PEDRO DE LOS MILAGROS' then 'SAN PEDRO'
    when 'VALLE DEL GUAMUEZ' then 'LA HORMIGA' when 'MANAURE BALCON DEL CESAR' then 'MANAURE' else c end
  from (select regexp_replace(trim(regexp_replace(regexp_replace(public.auto_norm(t), '\(.*?\)', ' ', 'g'), '[.,_-]+', ' ', 'g')), '(\s+D\s*C)$|\s+(?=\s)', '', 'g') c) x;
$$;
