-- RLS rápida: la lista de cuentas visibles se calcula una vez por consulta (initPlan), no fila por fila.
create function public.app_cuentas_visibles(p_modulo text default null) returns text[]
language sql stable security definer set search_path = '' as $$
  select case when public.app_es_owner() then array(select slug from public.effi_accounts)
  else array(
    select p.cuenta from public.app_permisos p join public.app_usuarios u using (user_id)
    where p.user_id = (select auth.uid())
      and (u.rol = 'socio' or p_modulo is null or p_modulo = any (p.modulos)))
  end;
$$;
revoke all on function public.app_cuentas_visibles(text) from public, anon;
grant execute on function public.app_cuentas_visibles(text) to authenticated;

drop policy ver on public.effi_accounts;
drop policy ver on public.effi_guias;
drop policy ver on public.effi_guia_estados;
drop policy ver on public.effi_novedades;
drop policy ver on public.effi_wallet;
drop policy ver on public.effi_sync_state;
drop policy ver on public.effi_sync_jobs;
drop policy ver on public.effi_sync_runs;
drop policy ver on public.effi_webhook_events;

create policy ver on public.effi_accounts for select to authenticated using (slug = any ((select public.app_cuentas_visibles())::text[]));
create policy ver on public.effi_guias for select to authenticated using (cuenta = any ((select public.app_cuentas_visibles())::text[]));
create policy ver on public.effi_guia_estados for select to authenticated using (cuenta = any ((select public.app_cuentas_visibles())::text[]));
create policy ver on public.effi_novedades for select to authenticated using (cuenta = any ((select public.app_cuentas_visibles('novedades'))::text[]));
create policy ver on public.effi_wallet for select to authenticated using (cuenta = any ((select public.app_cuentas_visibles('dinero'))::text[]));
create policy ver on public.effi_sync_state for select to authenticated using ((select public.app_es_owner()));
create policy ver on public.effi_sync_jobs for select to authenticated using ((select public.app_es_owner()));
create policy ver on public.effi_sync_runs for select to authenticated using ((select public.app_es_owner()));
create policy ver on public.effi_webhook_events for select to authenticated using ((select public.app_es_owner()));

drop policy app_usuarios_ver on public.app_usuarios;
drop policy app_usuarios_owner on public.app_usuarios;
drop policy app_permisos_ver on public.app_permisos;
drop policy app_permisos_owner on public.app_permisos;
create policy app_usuarios_ver on public.app_usuarios for select to authenticated
  using (user_id = (select auth.uid()) or (select public.app_es_owner()));
create policy app_usuarios_owner on public.app_usuarios for update to authenticated
  using ((select public.app_es_owner())) with check ((select public.app_es_owner()));
create policy app_permisos_ver on public.app_permisos for select to authenticated
  using (user_id = (select auth.uid()) or (select public.app_es_owner()));
create policy app_permisos_owner on public.app_permisos for all to authenticated
  using ((select public.app_es_owner())) with check ((select public.app_es_owner()));
