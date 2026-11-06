create index if not exists effi_guias_sin_recaudo on public.effi_guias (cuenta, guia) where fecha_recaudo is null and recaudo;
