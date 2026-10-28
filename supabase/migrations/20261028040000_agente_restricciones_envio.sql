-- Condiciones de envío por ciudad que mandan las asesoras logísticas (Colombia, 28-oct): "solo pago anticipado", "sin
-- cobertura", "solo a oficina de Interrapidísimo", "validar con el cliente"… Son un recordatorio para la asesora: la
-- orden sale en el agente con el aviso, y la entrega en oficina de Colombia ya no se crea sola si la ciudad tiene una
-- condición (salvo "solo a oficina de Interrapidísimo" cuando la orden es justo a oficina de Inter).
-- Los datos (la lista de las asesoras) se cargan aparte en la tabla; aquí solo va la estructura.
create table if not exists public.auto_restricciones (
  id bigint generated always as identity primary key,
  cuenta text not null references public.effi_accounts (slug),
  dpto text,              -- inicio del departamento en clave (solo letras, sin tildes, mayúsculas); null = cualquiera
  ciudades text[] not null default '{}',  -- ciudades en clave que tienen la condición
  palabra text,           -- o: palabra en clave que aparece en la dirección (corregimientos y barrios)…
  en_ciudades text[],     -- …dentro de estas ciudades (null = cualquiera del departamento)
  tipo text not null check (tipo in ('anticipado', 'anticipado_flete', 'sin_cobertura', 'flete_alto', 'solo_envia', 'inter_oficina', 'validar')),
  motivo text not null,   -- lo que escribió la asesora
  lugar text not null,    -- cómo lo escribió la asesora (departamento · municipio)
  creado_en timestamptz not null default now()
);
alter table public.auto_restricciones enable row level security;
drop policy if exists auto_restricciones_leer on public.auto_restricciones;
create policy auto_restricciones_leer on public.auto_restricciones for select to authenticated
  using (cuenta = any (public.app_cuentas_visibles('automatizacion')));

create or replace function public.auto_clave(t text) returns text language sql immutable as $$
  select regexp_replace(public.auto_norm(t), '[^A-Z]', '', 'g');
$$;

-- La condición que aplica a una orden (por su ciudad y departamento, o por una palabra de la dirección).
create or replace function public.auto_restriccion(p_cuenta text, p_ciudad text, p_dpto text, p_direccion text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('tipo', r.tipo, 'motivo', r.motivo, 'lugar', r.lugar)
  from public.auto_restricciones r
  where r.cuenta = p_cuenta
    and (r.dpto is null or public.auto_clave(p_dpto) like r.dpto || '%')
    and (public.auto_clave(p_ciudad) = any (r.ciudades)
      or (r.palabra is not null and public.auto_clave(p_direccion) like '%' || r.palabra || '%'
          and (r.en_ciudades is null or public.auto_clave(p_ciudad) = any (r.en_ciudades))))
  order by (public.auto_clave(p_ciudad) = any (r.ciudades)) desc, r.id
  limit 1;
$$;
revoke all on function public.auto_restriccion(text, text, text, text) from public, anon;

-- auto_lista: cada orden trae su condición de envío (o null).
do $$
declare d text := pg_get_functiondef('public.auto_lista(text,integer)'::regprocedure);
begin
  if position('''restriccion''' in d) = 0 then
    d := replace(d, '''ciudad'', ciudad, ''provincia'', provincia,',
      '''ciudad'', ciudad, ''provincia'', provincia, ''restriccion'', public.auto_restriccion(cuenta, ciudad, provincia, '
      || 'coalesce(plan->''remision''->>''direccion_cliente'', plan->''guia''->''direccion_destinatario''->>0)),');
    if position('''restriccion''' in d) = 0 then raise exception 'auto_lista cambió: no se pudo agregar la restricción'; end if;
    execute d;
  end if;
end $$;
