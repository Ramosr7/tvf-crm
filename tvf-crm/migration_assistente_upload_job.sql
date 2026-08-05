-- Fila de upload de PDF pro Joaozinho — o arquivo é salvo no banco na hora do upload (rápido,
-- sobrevive a fechar/trocar de aba), e a extração por IA (mais demorada) fica retomável a
-- qualquer momento: se a aba morrer no meio do processamento, o gestor volta na tela de
-- Importar > Joaozinho e clica em "Retomar" pra continuar de onde parou, sem subir de novo.

create table if not exists assistente_upload_job (
    id uuid primary key default gen_random_uuid(),
    titulo text not null,
    filename text,
    arquivo_base64 text not null,
    status text not null default 'pendente' check (status in ('pendente', 'processando', 'concluido', 'erro')),
    conteudo_extraido text,
    erro_msg text,
    criado_por uuid references consultores_staff(id),
    criado_em timestamptz default now(),
    concluido_em timestamptz
);

alter table assistente_upload_job enable row level security;

create policy "gestor_ve_upload_job" on assistente_upload_job for select using (is_gestor());
create policy "gestor_insere_upload_job" on assistente_upload_job for insert with check (is_gestor());
create policy "gestor_atualiza_upload_job" on assistente_upload_job for update using (is_gestor());
create policy "gestor_deleta_upload_job" on assistente_upload_job for delete using (is_gestor());
