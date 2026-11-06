-- Feed en vivo: últimos cambios (todos o por estado) sin recorrer todo el historial.
create index if not exists effi_guia_estados_fecha on public.effi_guia_estados (fecha_hist_est desc);
create index if not exists effi_guia_estados_estado_fecha on public.effi_guia_estados (est_guia_new_efficommerce, fecha_hist_est desc);
analyze public.effi_guia_estados;
