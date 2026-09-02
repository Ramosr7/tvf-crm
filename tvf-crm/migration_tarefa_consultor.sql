-- Plano de ação da "Análise com IA" (Relatórios) deixa de ser só texto que some depois de
-- lido — vira tarefa persistida, associada ao consultor, que ele mesmo marca como concluída.
-- Cobre tanto o plano INDIVIDUAL de cada consultor quanto o plano COLETIVO (nesse caso, uma
-- linha por consultor que participou da análise, mesmo texto repetido — mantém o modelo
-- simples de "toda tarefa pertence a um consultor").

create table if not exists tarefa_consultor (
  id uuid primary key default gen_random_uuid(),
  consultor_id uuid not null references consultores_staff(id),
  descricao text not null,
  origem text not null check (origem in ('individual', 'coletivo')),
  gerado_em timestamptz default now(),
  gerado_por uuid references consultores_staff(id),
  concluido boolean not null default false,
  concluido_em timestamptz
);

alter table tarefa_consultor enable row level security;

-- Gestor vê e cria tudo (é quem roda a análise); consultor só vê e conclui as próprias.
create policy "gestor_ve_todas_tarefas" on tarefa_consultor for select using (is_gestor());
create policy "consultor_ve_proprias_tarefas" on tarefa_consultor for select using (auth.uid() = consultor_id);
create policy "gestor_cria_tarefas" on tarefa_consultor for insert with check (is_gestor());
create policy "consultor_conclui_propria_tarefa" on tarefa_consultor for update
  using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);
