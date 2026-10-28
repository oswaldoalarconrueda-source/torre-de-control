-- Bandeja de novedades: lo que la asesora escribe en la línea (solución, fecha, teléfono, dirección y qué dijo el
-- cliente) se guarda como borrador mientras escribe. Antes vivía solo en la pantalla y se perdía al recargar la página
-- (queja de las asesoras de Ecuador, 28-oct). Uno por novedad, compartido por el equipo; vacío = se borra.
-- Los borradores de más de 15 días se limpian solos (la novedad ya se cerró o se envió).
create table public.novedad_borradores (
  cuenta text not null references public.effi_accounts (slug),
  empresa bigint not null,
  novedad bigint not null,
  datos jsonb not null check (pg_column_size(datos) <= 4000),
  usuario uuid,
  usuario_email text,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, empresa, novedad)
);
alter table public.novedad_borradores enable row level security;
create policy novedad_borradores_leer on public.novedad_borradores for select to authenticated
  using (cuenta = any ((select public.app_cuentas_visibles('novedades'))::text[]));

create function public.novedad_borrador(p_cuenta text, p_empresa bigint, p_novedad bigint, p_datos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not p_cuenta = any (public.app_cuentas_visibles('novedades')) then raise exception 'Sin permiso para esta tienda'; end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' or p_datos = '{}'::jsonb then
    delete from public.novedad_borradores where cuenta = p_cuenta and empresa = p_empresa and novedad = p_novedad;
    return;
  end if;
  insert into public.novedad_borradores (cuenta, empresa, novedad, datos, usuario, usuario_email)
  values (p_cuenta, p_empresa, p_novedad, p_datos, auth.uid(), (select email from auth.users where id = auth.uid()))
  on conflict (cuenta, empresa, novedad) do update
    set datos = excluded.datos, usuario = excluded.usuario, usuario_email = excluded.usuario_email, actualizado_en = now();
end $$;
revoke all on function public.novedad_borrador(text, bigint, bigint, jsonb) from public, anon;
grant execute on function public.novedad_borrador(text, bigint, bigint, jsonb) to authenticated;

-- La bandeja trae el borrador de cada línea.
do $$
declare f text := pg_get_functiondef('public.novedades_bandeja(text[])'::regprocedure); nuevo text;
begin
  nuevo := replace(f, $x$'contenido', g.contenido,$x$, $x$'contenido', g.contenido,
    'borrador', (select b.datos from public.novedad_borradores b where b.cuenta = n.cuenta and b.empresa = n.empresa and b.novedad = n.id),$x$);
  if nuevo = f then raise exception 'novedades_bandeja cambió: no se pudo agregar el borrador'; end if;
  execute nuevo;
end $$;

-- Limpieza diaria: también los borradores viejos.
create or replace function public.limpieza_diaria()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a int; b int; c int; d int;
begin
  delete from public.effi_sync_runs where inicio < now() - interval '3 days';
  get diagnostics a = row_count;
  delete from cron.job_run_details where start_time < now() - interval '3 days';
  get diagnostics b = row_count;
  delete from public.effi_webhook_events
  where (procesado_en is not null and recibido_en < now() - interval '3 days')
     or recibido_en < now() - interval '15 days';
  get diagnostics c = row_count;
  delete from public.novedad_borradores where actualizado_en < now() - interval '15 days';
  get diagnostics d = row_count;
  return jsonb_build_object('sync_runs', a, 'cron', b, 'avisos', c, 'borradores', d);
end $$;
revoke all on function public.limpieza_diaria() from public, anon, authenticated;
