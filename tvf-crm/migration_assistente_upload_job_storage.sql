-- Troca base64-numa-coluna-de-texto por Supabase Storage. PDF de book de ofertas com imagem
-- pesada estava batendo no limite de tamanho de request do PostgREST na hora do insert direto
-- (erro "Request Entity Too Large") — Storage aguenta arquivo binário grande sem esse problema.

alter table assistente_upload_job drop column if exists arquivo_base64;
alter table assistente_upload_job add column if not exists storage_path text;

insert into storage.buckets (id, name, public)
values ('assistente-uploads', 'assistente-uploads', false)
on conflict (id) do nothing;

create policy "gestor_upload_assistente_storage" on storage.objects for insert
  with check (bucket_id = 'assistente-uploads' and is_gestor());
create policy "gestor_select_assistente_storage" on storage.objects for select
  using (bucket_id = 'assistente-uploads' and is_gestor());
create policy "gestor_delete_assistente_storage" on storage.objects for delete
  using (bucket_id = 'assistente-uploads' and is_gestor());
