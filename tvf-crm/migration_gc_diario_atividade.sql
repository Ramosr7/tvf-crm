-- Aba "Diário" na Gestão Comercial — João sobe um PDF de atividades por dia (uso pessoal,
-- só o Gestor vê). Reaproveita o bucket "assistente-uploads" (já existe, já tem policy
-- is_gestor()), só entra numa pasta separada (diario/...) pra não misturar com os outros usos.

create table if not exists gc_diario_atividade (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  titulo text,
  filename text not null,
  storage_path text not null,
  upload_job_id uuid references assistente_upload_job(id),
  texto_extraido text,
  feedback_ia text,
  criado_em timestamptz default now()
);

alter table gc_diario_atividade enable row level security;

create policy "gestor_gerencia_diario" on gc_diario_atividade for all
  using (is_gestor()) with check (is_gestor());
