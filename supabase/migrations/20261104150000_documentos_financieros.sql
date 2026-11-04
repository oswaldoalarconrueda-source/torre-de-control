-- Extractos bancarios y cobros de Meta en CSV o PDF (pedido del dueño, 4-nov): se guarda el archivo original en un almacén
-- privado, por tienda, tipo y mes, con quién lo subió. Solo el dueño los ve, sube o borra. Todavía no se leen sus cifras.
create table public.app_documentos (
  id bigserial primary key,
  tipo text not null check (tipo in ('extracto_bancario', 'cobros_meta')),
  cuenta text not null,
  mes date not null,
  nota text,
  archivo text not null,
  ruta text not null unique,
  bytes bigint not null,
  sha256 text not null,
  subido_por text,
  creado_en timestamptz not null default now(),
  unique (tipo, cuenta, sha256)
);
alter table public.app_documentos enable row level security;
create policy "documentos: solo el dueño" on public.app_documentos for all to authenticated
  using (public.app_es_owner()) with check (public.app_es_owner());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-financieros', 'documentos-financieros', false, 20971520, array['application/pdf', 'text/csv'])
on conflict (id) do nothing;

create policy "documentos financieros: ver" on storage.objects for select to authenticated
  using (bucket_id = 'documentos-financieros' and public.app_es_owner());
create policy "documentos financieros: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-financieros' and public.app_es_owner());
create policy "documentos financieros: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos-financieros' and public.app_es_owner());
