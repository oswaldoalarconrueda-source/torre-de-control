// Genera la migración SQL del sync de Effi a partir de una sola definición de columnas.
// Uso: node supabase/schema/gen-sync-schema.mjs > supabase/migrations/<ts>_effi_sync.sql
// Cada tabla tiene una función effi_upsert_<tabla>(p_cuenta, p_rows jsonb) que hace merge:
// un campo que llega null no borra lo que ya había (las fuentes parciales, como el historial
// de estados, no pisan datos de la guía completa).

const T = {
  effi_guias: {
    pk: ['cuenta', 'empresa', 'sucursal', 'id'],
    cols: {
      cuenta: 'text not null references public.effi_accounts(slug)',
      empresa: 'bigint not null',
      sucursal: 'int not null',
      id: 'bigint not null',
      id_transaccion: 'text',
      guia: 'text',
      guia_adicional: 'text',
      fecha_trans: 'timestamptz',
      fecha_envio: 'date',
      fecha_entrega_esperada: 'date',
      fecha_guia_adicional: 'timestamptz',
      fecha_estado_final: 'timestamptz',
      fecha_estado_final_guia_adicional: 'timestamptz',
      fecha_anular: 'timestamptz',
      centro_costos: 'int',
      nombre_centro_costos: 'text',
      nombre_destinatario: 'text',
      id_destinatario: 'text',
      telefonos_destinatario: 'text',
      direccion_destinatario: 'text',
      nombre_ciudad_destinatario: 'text',
      nombre_provincia_destinatario: 'text',
      nombre_pais_destinatario: 'text',
      transportadora_efficommerce: 'int',
      nombre_transportadora_efficommerce: 'text',
      nombre_transportadora: 'text',
      servicio: 'text',
      contenido: 'text',
      t_trans_ref: 'int',
      sucursal_ref: 'int',
      id_ref: 'bigint',
      transaccion_dropshipping: 'bigint',
      empresa_proveedor: 'bigint',
      nombre_empresa_proveedor: 'text',
      empresa_distribuidor: 'bigint',
      nombre_empresa_distribuidor: 'text',
      divisa: 'text',
      valor_declarado: 'numeric',
      recaudo: 'boolean',
      valor_recaudo: 'numeric',
      valor_flete: 'numeric',
      descuento: 'numeric',
      est_guia: 'int',
      estado: 'text',
      est_guia_efficommerce: 'int',
      estado_efficommerce: 'text',
      est_guia_adicional_efficommerce: 'int',
      estado_adicional_efficommerce: 'text',
      liquidacion_efficommerce: 'boolean',
      recaudo_efficommerce: 'boolean',
      sin_recaudo_efficommerce: 'boolean',
      devolucion_efficommerce: 'boolean',
      indemnizacion_efficommerce: 'boolean',
      logistica_efficommerce: 'boolean',
      recaudo_efficommerce_transportadora: 'boolean',
      vigente: 'boolean',
      ultimo_cambio_estado: 'timestamptz',
    },
    // Columnas que se combinan con greatest() en vez de coalesce().
    greatest: ['ultimo_cambio_estado'],
    indexes: [
      '(cuenta, guia)',
      '(cuenta, fecha_trans desc)',
      '(cuenta, est_guia_efficommerce)',
    ],
  },
  effi_guia_estados: {
    // El historial no trae un id propio: la llave es la guía + el momento + el estado nuevo.
    pk: ['cuenta', 'empresa', 'sucursal', 'id_guia', 'fecha_hist_est', 'guia_inicial_adicional', 'est_guia_new'],
    cols: {
      cuenta: 'text not null references public.effi_accounts(slug)',
      empresa: 'bigint not null',
      sucursal: 'int not null',
      id_guia: 'bigint not null',
      fecha_hist_est: 'timestamptz not null',
      guia_inicial_adicional: 'boolean not null',
      est_guia_new: 'int not null',
      guia: 'text',
      guia_adicional: 'text',
      estado_new: 'text',
      est_guia_new_efficommerce: 'int',
      estado_new_efficommerce: 'text',
      observacion_hist_est: 'text',
      responsable_cambio: 'text',
      transportadora_efficommerce: 'int',
      nombre_transportadora_efficommerce: 'text',
    },
    insertOnly: true,
    indexes: ['(cuenta, fecha_hist_est desc)', '(cuenta, guia)'],
  },
  effi_novedades: {
    pk: ['cuenta', 'empresa', 'id'],
    cols: {
      cuenta: 'text not null references public.effi_accounts(slug)',
      empresa: 'bigint not null',
      id: 'bigint not null',
      guia_novedad: 'text',
      guia_inicial_adicional: 'boolean',
      est_novedad: 'int',
      estado_novedad: 'text',
      t_novedad: 'int',
      tipo_novedad: 'text',
      transportadora_efficommerce: 'int',
      nombre_transportadora_efficommerce: 'text',
      id_novedad: 'int',
      nombre_novedad: 'text',
      aclaracion: 'text',
      cant_gestion: 'int',
      fecha_trans: 'timestamptz',
      // Effi no documenta la zona de estas fechas: se guardan tal cual, sin zona.
      fecha_trans_transportadora: 'timestamp',
      fecha_ultima_gestion: 'timestamp',
      fecha_solucion: 'timestamp',
      sucursal_guia: 'int',
      id_guia: 'bigint',
      guia: 'text',
      guia_adicional: 'text',
      nombre_centro_costos: 'text',
      nombre_ciudad_destinatario: 'text',
      nombre_provincia_destinatario: 'text',
      valor_recaudo: 'numeric',
      est_guia: 'int',
      estado: 'text',
      vigente: 'boolean',
    },
    indexes: ['(cuenta, fecha_trans desc)', '(cuenta, guia)', '(cuenta, est_novedad)'],
  },
  effi_wallet: {
    pk: ['cuenta', 'id'],
    cols: {
      cuenta: 'text not null references public.effi_accounts(slug)',
      id: 'bigint not null',
      fecha_trans: 'timestamptz',
      fecha_origen: 'timestamptz',
      cuenta_effi: 'bigint',
      sucursal: 'int',
      centro_costos: 'int',
      nombre_centro_costos: 'text',
      t_movimiento: 'int',
      tipo_movimiento: 'text',
      detalle: 'text',
      valor: 'numeric',
      divisa: 'text',
      empresa_responsable: 'bigint',
      movimiento_dinero_effi_reversion: 'bigint',
      guia_inicial: 'text',
      guia_adicional: 'text',
      empresa_guia: 'bigint',
      sucursal_guia: 'int',
      id_guia: 'bigint',
      t_trans_ref: 'int',
      sucursal_ref: 'int',
      id_ref: 'bigint',
      transportadora_efficommerce: 'int',
      nombre_transportadora_efficommerce: 'text',
      solicitud_retiro: 'bigint',
      transferencia_cuenta_effi: 'bigint',
      t_origen: 'int',
      tipo_origen: 'text',
      fecha_anular: 'timestamptz',
      vigente: 'boolean',
    },
    indexes: ['(cuenta, fecha_trans desc)', '(cuenta, guia_inicial)', '(cuenta, t_movimiento)'],
  },
};

const out = [];
const p = (s = '') => out.push(s);

p('-- Generado por supabase/schema/gen-sync-schema.mjs. No editar a mano.');
p('-- Tablas de datos de Effi + funciones de upsert + estado del sync.');
p();
p("alter table public.effi_accounts add column if not exists empresa_id bigint;");
p("alter table public.effi_accounts add column if not exists tz_offset_min int not null default -300; -- minutos respecto a UTC de la zona de la empresa (filtros de la API)");
p("update public.effi_accounts set empresa_id = 58004, tz_offset_min = -300 where slug = 'TIENDA_CO';");
p("update public.effi_accounts set empresa_id = 57380, tz_offset_min = -300 where slug = 'TIENDA_EC';");
p("update public.effi_accounts set empresa_id = 56172, tz_offset_min = -360 where slug = 'TIENDA_GT';");
p("update public.effi_accounts set tz_offset_min = -360 where slug = 'TIENDA_CR';");
p();

for (const [name, t] of Object.entries(T)) {
  const colDefs = Object.entries(t.cols).map(([c, d]) => `  ${c} ${d}`);
  colDefs.push('  actualizado_en timestamptz not null default now()');
  colDefs.push(`  primary key (${t.pk.join(', ')})`);
  p(`create table public.${name} (\n${colDefs.join(',\n')}\n);`);
  p(`alter table public.${name} enable row level security;`);
  for (const ix of t.indexes || []) {
    const ixName = `${name}_${ix.replace(/[^a-z_]+/g, '_').replace(/^_|_$/g, '')}`.slice(0, 60);
    p(`create index ${ixName} on public.${name} ${ix};`);
  }

  const cols = Object.keys(t.cols);
  const nonPk = cols.filter((c) => !t.pk.includes(c));
  const set = nonPk.map((c) =>
    (t.greatest || []).includes(c)
      ? `    ${c} = greatest(excluded.${c}, ${name}.${c})`
      : `    ${c} = coalesce(excluded.${c}, ${name}.${c})`,
  );
  set.push('    actualizado_en = now()');
  const conflict = t.insertOnly
    ? `on conflict (${t.pk.join(', ')}) do nothing`
    : `on conflict (${t.pk.join(', ')}) do update set\n${set.join(',\n')}`;
  p(`
create function public.effi_upsert_${name.replace(/^effi_/, '')}(p_cuenta text, p_rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.${name} (${cols.join(', ')})
  select ${cols.map((c) => (c === 'cuenta' ? 'p_cuenta' : `r.${c}`)).join(', ')}
  from jsonb_populate_recordset(null::public.${name}, p_rows) r
  ${conflict};
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.effi_upsert_${name.replace(/^effi_/, '')}(text, jsonb) from public, anon, authenticated;
grant execute on function public.effi_upsert_${name.replace(/^effi_/, '')}(text, jsonb) to service_role;
`);
}

p(`-- Estado del sync incremental: hasta qué instante (UTC) está sincronizado cada recurso de cada cuenta.
create table public.effi_sync_state (
  cuenta text not null references public.effi_accounts(slug),
  recurso text not null,
  cursor_utc timestamptz,
  ultimo_ok timestamptz,
  ultimo_error text,
  filas_ultima int,
  primary key (cuenta, recurso)
);
alter table public.effi_sync_state enable row level security;

-- Cargas históricas y reconciliaciones: rangos que se recorren por tramos en las corridas del cron.
create table public.effi_sync_jobs (
  id bigint generated always as identity primary key,
  cuenta text not null references public.effi_accounts(slug),
  recurso text not null,
  desde_utc timestamptz not null,
  hasta_utc timestamptz not null,
  avance_utc timestamptz not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','listo','error')),
  filas bigint not null default 0,
  error text,
  creado_en timestamptz not null default now(),
  terminado_en timestamptz
);
alter table public.effi_sync_jobs enable row level security;
create index effi_sync_jobs_pendientes on public.effi_sync_jobs (cuenta, id) where estado = 'pendiente';

-- Bitácora de corridas (se conserva 7 días).
create table public.effi_sync_runs (
  id bigint generated always as identity primary key,
  inicio timestamptz not null default now(),
  fin timestamptz,
  resumen jsonb
);
alter table public.effi_sync_runs enable row level security;

-- Candado para que dos corridas no se pisen.
create table public.effi_sync_lock (
  id int primary key default 1 check (id = 1),
  bloqueado_hasta timestamptz not null default '-infinity'
);
insert into public.effi_sync_lock default values;
alter table public.effi_sync_lock enable row level security;

create function public.effi_sync_try_lock(p_segundos int) returns boolean
language sql security definer set search_path = '' as $$
  update public.effi_sync_lock set bloqueado_hasta = now() + make_interval(secs => p_segundos)
  where id = 1 and bloqueado_hasta < now()
  returning true;
$$;
create function public.effi_sync_unlock() returns void
language sql security definer set search_path = '' as $$
  update public.effi_sync_lock set bloqueado_hasta = '-infinity' where id = 1;
$$;

-- Secretos en Vault: API keys de Effi (effi_api_key_<SLUG>) y token del cron (effi_sync_token).
create function public.effi_set_api_key(p_slug text, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.effi_accounts where slug = p_slug) then
    raise exception 'Cuenta desconocida: %', p_slug;
  end if;
  select id into v_id from vault.secrets where name = 'effi_api_key_' || p_slug;
  if v_id is null then
    perform vault.create_secret(p_key, 'effi_api_key_' || p_slug, 'API key Effi de ' || p_slug);
  else
    perform vault.update_secret(v_id, p_key);
  end if;
end $$;

create function public.effi_get_api_keys() returns table (slug text, api_key text)
language sql security definer set search_path = '' as $$
  select a.slug, s.decrypted_secret
  from public.effi_accounts a
  join vault.decrypted_secrets s on s.name = 'effi_api_key_' || a.slug
  where a.activa;
$$;

create function public.effi_check_sync_token(p_token text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'effi_sync_token' and decrypted_secret = p_token);
$$;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'effi_sync_token', 'Token que el cron envía a la función effi-sync');

do $$
declare f text;
begin
  foreach f in array array['effi_sync_try_lock(int)','effi_sync_unlock()','effi_set_api_key(text, text)','effi_get_api_keys()','effi_check_sync_token(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;`);

console.log(out.join('\n'));
