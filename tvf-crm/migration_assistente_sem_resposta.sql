-- Marca a pergunta do consultor quando o Joaozinho não soube responder (não achou no
-- conteúdo cadastrado) — Gestor consegue ver só essas perguntas (não o chat inteiro, que
-- continua privado) pra saber o que falta alimentar na base de conhecimento.

alter table assistente_mensagem add column if not exists sem_resposta boolean not null default false;
alter table assistente_mensagem add column if not exists resolvida boolean not null default false;

-- consultor precisa poder atualizar a própria mensagem (marcar sem_resposta depois de ver a
-- resposta da IA) — só tinha select/insert/delete até agora
create policy "consultor_atualiza_propria_mensagem_assistente" on assistente_mensagem
    for update using (consultor_id = auth.uid());

-- Gestor vê e resolve só as perguntas sinalizadas como sem resposta — não o chat inteiro
create policy "gestor_ve_perguntas_sem_resposta" on assistente_mensagem
    for select using (is_gestor() and sem_resposta = true);
create policy "gestor_atualiza_perguntas_sem_resposta" on assistente_mensagem
    for update using (is_gestor() and sem_resposta = true);
