-- Pedido del dueño (22-nov-2026): unir productos que son el mismo con nombres distintos (A un clic Guatemala, puntos 1 al 22).
-- prod_unificar se aplica sobre el nombre ya calculado por prod_nombre (después de los alias), así sirve aunque venga de un alias.
create table if not exists public.prod_unificar (
  cuenta text not null,
  desde text not null,
  hacia text not null,
  creado_en timestamptz not null default now(),
  primary key (cuenta, desde)
);
alter table public.prod_unificar enable row level security;

create or replace function public.prod_nombre(p_cuenta text, p_nombre text)
 returns text language sql stable set search_path to '' as $function$
  with n as (select btrim(regexp_replace(coalesce(p_nombre, ''), '\s*\+\s*ENV[IÍ]O GRATIS\s*$', '', 'i')) as t),
  r as (
    select coalesce(
      (select a.producto from public.prod_alias a, n
       where (a.cuenta is null or a.cuenta = p_cuenta) and public.prod_clave(n.t) ~ a.patron
       order by a.prioridad, a.id limit 1),
      (select nullif(initcap(lower(n.t)), '') from n), 'Sin producto') as v)
  select coalesce((select u.hacia from public.prod_unificar u, r where u.cuenta = p_cuenta and u.desde = r.v), r.v) from r;
$function$;

-- Masilla (A un clic): Dropi la llama «Masilla Para Diente Temporal» y Effi «MASILLA PARA REPARACIÓN DENTAL».
insert into public.prod_alias (cuenta, patron, producto, prioridad)
select c, '^MASILLA PARA (DIENTE TEMPORAL|REPARACION DENTAL)', 'Masilla Para Diente Temporal', 40 from unnest(array['AUNCLIC_GT', 'AUNCLIC_HN', 'AUNCLIC_SV']) c
where not exists (select 1 from public.prod_alias a where a.cuenta = c and a.patron = '^MASILLA PARA (DIENTE TEMPORAL|REPARACION DENTAL)');

insert into public.prod_unificar (cuenta, desde, hacia)
select 'AUNCLIC_GT', otro, canon from (values
  ('Dr. Melaxin Peel Shot', 'Melaxin (J)'), ('Dr. Melaxin Peel Shot', 'Peel Shoot Dr Melaxin'),
  ('Her Loss Con Feromonas', 'Her Loss'), ('Her Loss Con Feromonas', 'Her Loss Perfume (J)'), ('Her Loss Con Feromonas', 'Her Loss Perfume Con Feromonas'),
  ('Bocina Jbl Charge 5', 'Jbl Charge 5'), ('Jbl Xtrem4', 'Jbl Xtreme 4'), ('Evil Goods', 'Balsamo Cebo Res Evil Goods'),
  ('Spray Para Pies Beriberi Profesional', 'Fungus Beri Beri'), ('Probiotico Uro X 60 Caps', 'Uro'), ('Apolo Balsamo Estimulante', 'Apolo'),
  ('Shilajit Ultra Original', 'Shilajit Ultra Optimal Potency * 60 Caps'), ('Shilajit Ultra Original', 'Shilajit Ultra'),
  ('Parche De Cuero Negro Yarda * Media Yarda', 'Parche De Cuero'), ('Parche De Cuero Negro Yarda * Media Yarda', 'Parche De Cuero Negro Yarda * Media'),
  ('Base Alta Cobertura Air Cushion Bb Cream', 'Base De Alta Cobertura'), ('Pistola Masajeadora Portatil', 'Pistola Masageadora Smart'),
  ('Crema Nida', 'Nida'),
  ('Crema Dental Morada', 'Pasta Dental Blanqueadora'), ('Crema Dental Morada', 'Crema Dental Blanquiadora Morada'), ('Crema Dental Morada', 'Pasta Dental Blanqueadora Purple'),
  ('Camara De Auto Sport', 'Camara De Auto'), ('Antena Tdt Digital Udh', 'Antena Para Television'), ('Tableta Limpiadora Pas', 'Pastilla Limpiadora Para Lavadora'),
  ('Cinta Impermeable De Butilo 5m X 5cm', 'Cinta De Sellado Impermeable'), ('Creatine Monohydrate Powder For Women', 'Creatina Monohidrata For Women X 240g'),
  ('Audifono Amplificador', 'Audifono Para Sordera Amplificador'), ('Serum Crecimiento De Pestañas Bioaqua', 'Serum De Pestañas Bioaqua'),
  ('Mini Afeitadora Recargable', 'Mini Maquinilla De Afeitar Eléctrica')
) v(canon, otro)
on conflict (cuenta, desde) do update set hacia = excluded.hacia;

-- Puntos 23 al 29 (el dueño los aprobó después; las gomitas de creatina siguen aparte del polvo).
insert into public.prod_unificar (cuenta, desde, hacia)
select 'AUNCLIC_GT', otro, canon from (values
  ('Caja Ahorro Energía Power Save', 'Caja Ahorro Energía Power Save Pack X2'), ('Caja Ahorro Energía Power Save', 'Ahorrador Ee'),
  ('Protector De Timon', 'Cubiertas Antideslizantes Para Volante'),
  ('Lampara Solar Led', 'Lámpara Solar De Pared Con Sensor.'), ('Lampara Solar Led', 'Lampara Solar 3 Focos Con Sensor'),
  ('Duo Pulsera Oro', 'Duo Pulsera Llave Oro'),
  ('Mini Motosierra', 'Mini Sierra Electrica'), ('Mini Motosierra', 'Sierra Portatil (Im2039)'),
  ('Magnesio Complex 60 Cap', 'Magnesium Complex Toplux X 90 Cap'),
  ('Reloj Curren 8402 Original Acero', 'Reloj Curren 8402 Azul Acero')
) v(canon, otro)
on conflict (cuenta, desde) do update set hacia = excluded.hacia;
update public.prod_campana_asignada p set producto = u.hacia from public.prod_unificar u
where p.cuenta = 'AUNCLIC_GT' and u.cuenta = 'AUNCLIC_GT' and p.producto = u.desde;

-- Puntos 31 al 34: El Salvador.
insert into public.prod_unificar (cuenta, desde, hacia)
select 'AUNCLIC_SV', otro, canon from (values
  ('Dr Melaxin Peel Shot®', 'Dr Melaxin Peel Shot® (Tu Peel Shot · 1 Frasco 200 Ml)'),
  ('Hem Hero Tratamiento Para Hemorroides', 'Hem Hero Tratamiento Para Hemorroides (Tu Primer Mes Sin Brotes · 1 Frasco)'),
  ('Bálsamo Estimulante De Barba Apolo — Ultra Potente', 'Apolo'),
  ('Migrastil Neuropathy Cream', 'Migrastil Neuropathy Cream (X1)')
) v(canon, otro)
on conflict (cuenta, desde) do update set hacia = excluded.hacia;
update public.prod_campana_asignada p set producto = u.hacia from public.prod_unificar u
where p.cuenta = 'AUNCLIC_SV' and u.cuenta = 'AUNCLIC_SV' and p.producto = u.desde;
