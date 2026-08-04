-- Assistente virtual "Joaozinho" — chat privado por consultor (widget flutuante), alimentado
-- por conteúdo que o Gestor sobe (texto colado ou PDF/Excel, extraído automaticamente pra
-- texto). Subir de novo com o mesmo título substitui o conteúdo anterior daquele tema, pra
-- não ficar informação desatualizada conflitando com a nova.

create table if not exists assistente_conteudo (
    id uuid primary key default gen_random_uuid(),
    titulo text not null unique,
    conteudo text not null,
    tipo_origem text not null default 'texto' check (tipo_origem in ('texto', 'pdf', 'xlsx')),
    atualizado_por uuid references consultores_staff(id),
    atualizado_em timestamptz default now()
);

alter table assistente_conteudo enable row level security;

create policy "todos_leem_conteudo_assistente" on assistente_conteudo for select using (auth.role() = 'authenticated');
create policy "gestor_insere_conteudo_assistente" on assistente_conteudo for insert with check (is_gestor());
create policy "gestor_atualiza_conteudo_assistente" on assistente_conteudo for update using (is_gestor());
create policy "gestor_deleta_conteudo_assistente" on assistente_conteudo for delete using (is_gestor());

-- histórico de chat, privado por consultor (é sobre privacidade, não sobre compartilhar contexto)
create table if not exists assistente_mensagem (
    id uuid primary key default gen_random_uuid(),
    consultor_id uuid not null references consultores_staff(id),
    role text not null check (role in ('user', 'assistant')),
    conteudo text not null,
    criado_em timestamptz default now()
);

create index if not exists idx_assistente_mensagem_consultor on assistente_mensagem(consultor_id, criado_em);

alter table assistente_mensagem enable row level security;

create policy "consultor_ve_propria_mensagem_assistente" on assistente_mensagem
    for select using (consultor_id = auth.uid());
create policy "consultor_insere_propria_mensagem_assistente" on assistente_mensagem
    for insert with check (consultor_id = auth.uid());
create policy "consultor_deleta_propria_mensagem_assistente" on assistente_mensagem
    for delete using (consultor_id = auth.uid());
