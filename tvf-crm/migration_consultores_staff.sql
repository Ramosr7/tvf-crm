-- ============================================================
-- Migração: consultores_staff (equipe interna, separado dos leads)
-- Corrige FK de carteira_cliente que hoje aponta pra "consultores" (tabela de leads)
-- ============================================================

create table if not exists consultores_staff (
    id uuid primary key references auth.users(id),
    nome text not null,
    perfil text not null check (perfil in ('Consultor','Supervisor','Gestor')),
    unidade text,
    criado_em timestamptz default now()
);

alter table consultores_staff enable row level security;

create policy "staff_ve_proprio_cadastro" on consultores_staff
    for select using (id = auth.uid());

-- Corrige a FK de carteira_cliente para apontar para consultores_staff
alter table carteira_cliente drop constraint if exists carteira_cliente_consultor_id_fkey;
alter table carteira_cliente add constraint carteira_cliente_consultor_id_fkey
    foreign key (consultor_id) references consultores_staff(id);

-- Idem para metas_consultor e rotina_diaria (mesma referência errada na migração original)
alter table metas_consultor drop constraint if exists metas_consultor_consultor_id_fkey;
alter table metas_consultor add constraint metas_consultor_consultor_id_fkey
    foreign key (consultor_id) references consultores_staff(id);

alter table rotina_diaria drop constraint if exists rotina_diaria_consultor_id_fkey;
alter table rotina_diaria add constraint rotina_diaria_consultor_id_fkey
    foreign key (consultor_id) references consultores_staff(id);

-- Depois de rodar isso:
-- 1. Authentication > Users > Add user (email/senha, Auto Confirm)
-- 2. Table Editor > consultores_staff > Insert row (id = UID do usuário criado, nome, perfil)
