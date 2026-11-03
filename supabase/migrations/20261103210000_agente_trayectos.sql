-- Colombia: tipo de trayecto por transportadora (matrices de cobertura de Efficommerce, pedido del dueño el 3-nov). Según
-- la ciudad del remitente y la de destino, cada transportadora es local, regional, nacional u otro más caro (reexpedido,
-- difícil acceso, especial). El agente solo recomienda local, regional o nacional y la asesora ve cuál es más económica.
-- Se carga del Excel con scripts/cargar-trayectos.py (reemplaza el origen); los datos no van en el repo.
create table public.auto_trayectos (
  origen text not null,
  transportadora integer not null,
  destino text not null,
  destino_clave text not null,
  dpto text not null default '',
  tipo text not null,
  recaudo boolean,
  cargado_en timestamptz not null default now(),
  primary key (origen, transportadora, destino_clave, dpto)
);
create index auto_trayectos_ruta_idx on public.auto_trayectos (origen, destino_clave);
alter table public.auto_trayectos enable row level security;

-- Ciudad de cada remitente de Effi: de ahí sale el origen del trayecto.
create table public.auto_remitentes (
  cuenta text not null,
  id integer not null,
  ciudad text not null,
  primary key (cuenta, id)
);
alter table public.auto_remitentes enable row level security;

-- Nombre de ciudad comparable entre Effi y las matrices: sin tildes, paréntesis, puntuación ni "D.C.", más los nombres
-- que Effi escribe distinto.
create or replace function public.auto_tray_clave(t text) returns text language sql immutable set search_path = '' as $$
  select case c when 'GUADALAJARA DE BUGA' then 'BUGA' when 'EL ESPINAL' then 'ESPINAL' when 'SANTA FE DE ANTIOQUIA' then 'SANTAFE DE ANTIOQUIA'
    when 'VISTA HERMOSA' then 'VISTAHERMOSA' when 'CALIMA EL DARIEN' then 'CALIMA DARIEN' when 'SAN MARTIN DE LOS LLANOS' then 'SAN MARTIN'
    when 'EL PENOL' then 'PENOL' when 'EL RETIRO' then 'RETIRO' when 'MUNICIPIO DE SOPO' then 'SOPO' when 'SAN PEDRO DE LOS MILAGROS' then 'SAN PEDRO'
    when 'VALLE DEL GUAMUEZ' then 'LA HORMIGA' when 'MANAURE BALCON DEL CESAR' then 'MANAURE' else c end
  from (select regexp_replace(trim(regexp_replace(regexp_replace(public.auto_norm(t), '\(.*?\)', ' ', 'g'), '[.,_-]+', ' ', 'g')), '(\s+D\s*C)$|\s+(?=\s)', '', 'g') c) x;
$$;
create or replace function public.auto_tray_dpto(t text) returns text language sql immutable set search_path = '' as $$
  select case public.auto_norm(t)
    when 'VALLE DEL CAUCA' then 'VALLE' when 'LA GUAJIRA' then 'GUAJIRA' when 'SAN ANDRES Y PROVIDENCIA' then 'SAN ANDRES'
    else public.auto_norm(t) end;
$$;
-- Qué es local, regional o nacional. Lo demás (reexpedido, difícil acceso, territorial, especial, zonal, otras) es "otro"
-- y no se recomienda: en las guías de octubre, "otras" y "zonal" de Coordinadora salen más caras que su nacional.
create or replace function public.auto_tray_clase(p_transportadora integer, p_tipo text) returns text language sql immutable set search_path = '' as $$
  select case
    when p_tipo in ('U', 'LOCAL', 'URBANO') then 'local'
    when p_tipo in ('R', 'REGIONAL') then 'regional'
    when p_tipo in ('N', 'NACIONAL') then 'nacional'
    else 'otro' end;
$$;

-- Trayecto de cada transportadora para una orden. Con departamento si la matriz lo trae: hay pueblos con el mismo nombre.
create or replace function public.auto_trayectos_ruta(p_cuenta text, p_remitente integer, p_ciudad text, p_dpto text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with o as (select ciudad from public.auto_remitentes where cuenta = p_cuenta and id = p_remitente),
  f as (
    select distinct on (t.transportadora) t.transportadora, t.tipo, t.recaudo
    from public.auto_trayectos t, o
    where t.origen = o.ciudad and t.destino_clave = public.auto_tray_clave(p_ciudad)
      and (t.dpto = '' or t.dpto = public.auto_tray_dpto(p_dpto))
    order by t.transportadora, (t.dpto = '')
  )
  select jsonb_build_object(
    'origen', (select ciudad from o),
    'opciones', coalesce((select jsonb_agg(jsonb_build_object('id', transportadora, 'clase', public.auto_tray_clase(transportadora, tipo),
        'etiqueta', case tipo
          when 'U' then 'Urbano' when 'R' then 'Regional' when 'N' then 'Nacional' when 'RX' then 'Reexpedido' when 'RX-E' then 'Reexpedido especial'
          when 'DIFICIL ACCESO' then 'Difícil acceso' when 'TRAYECTO ESPECIAL' then 'Trayecto especial'
          else initcap(tipo) end,
        'recaudo', recaudo)) from f), '[]'::jsonb)
  );
$$;
revoke all on function public.auto_trayectos_ruta(text, integer, text, text) from public, anon;
grant execute on function public.auto_trayectos_ruta(text, integer, text, text) to authenticated, service_role;

-- Flete real de las guías propias a esa ciudad (últimos 45 días, con recaudo) para que la asesora compare en plata. Solo
-- desde Bogotá: casi todas las guías salen de ahí y Effi no dice en cada guía de qué remitente salió. Effi numera distinto
-- las transportadoras en la guía (3 Inter, 4 Servientrega, 6 Coordinadora) que en el plan (4, 6, 10).
create or replace function public.auto_fletes_reales(p_cuenta text, p_remitente integer, p_ciudad text, p_dpto text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'flete', flete, 'guias', guias)), '[]'::jsonb) from (
    select case g.transportadora_efficommerce when 3 then 4 when 4 then 6 when 6 then 10 else g.transportadora_efficommerce end id,
      round((percentile_cont(0.5) within group (order by g.valor_flete))::numeric) flete, count(*) guias
    from public.effi_guias g
    where g.cuenta = p_cuenta and g.fecha_trans >= now() - interval '45 days' and g.vigente and g.recaudo and g.valor_flete > 0
      and g.nombre_ciudad_destinatario = p_ciudad and g.nombre_provincia_destinatario = p_dpto
      and p_cuenta = any (public.app_cuentas_visibles('automatizacion'))
      and exists (select 1 from public.auto_remitentes r where r.cuenta = p_cuenta and r.id = p_remitente and r.ciudad = 'BOGOTA')
    group by 1
  ) x;
$$;
revoke all on function public.auto_fletes_reales(text, integer, text, text) from public, anon;
grant execute on function public.auto_fletes_reales(text, integer, text, text) to authenticated;

-- Carga desde scripts/cargar-trayectos.py: reemplaza el origen. Solo con el token de sincronización del agente.
create or replace function public.auto_trayectos_cargar(p_token text, p_origen text, p_filas jsonb, p_borrar boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_token is null or p_token <> (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token') then
    raise exception 'Token no válido';
  end if;
  if p_borrar then delete from public.auto_trayectos where origen = p_origen; end if;
  insert into public.auto_trayectos (origen, transportadora, destino, destino_clave, dpto, tipo, recaudo)
  select p_origen, f.transportadora, f.destino, public.auto_tray_clave(f.destino), coalesce(f.dpto, ''), f.tipo, f.recaudo
  from jsonb_to_recordset(p_filas) as f(transportadora integer, destino text, dpto text, tipo text, recaudo boolean)
  on conflict (origen, transportadora, destino_clave, dpto) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.auto_trayectos_cargar(text, text, jsonb, boolean) from public;
grant execute on function public.auto_trayectos_cargar(text, text, jsonb, boolean) to anon, authenticated;
