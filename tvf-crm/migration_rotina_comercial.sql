-- Ajustes na tabela rotina_diaria (já criada na migração original) pra bater
-- com o Excel real "Rotina Executiva": faltava a coluna Renovação Móvel,
-- e faltava o Gestor poder ver a rotina de todos (só existia "vê a própria").

alter table rotina_diaria add column if not exists renovacao_movel integer default 0;
alter table rotina_diaria add column if not exists validado boolean default false;
alter table rotina_diaria add column if not exists validado_por uuid references consultores_staff(id);
alter table rotina_diaria add column if not exists validado_em timestamptz;

create policy "gestor_ve_toda_rotina" on rotina_diaria for select using (is_gestor());
drop policy if exists "gestor_insere_toda_rotina" on rotina_diaria;
create policy "gestor_insere_toda_rotina" on rotina_diaria for insert with check (is_gestor());
drop policy if exists "gestor_atualiza_toda_rotina" on rotina_diaria;
create policy "gestor_atualiza_toda_rotina" on rotina_diaria for update using (is_gestor());
