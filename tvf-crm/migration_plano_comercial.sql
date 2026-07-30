-- Plano Comercial: projeção de metas por vertical (Aparelho/HA/BL/MM/MB/Receita Telecom),
-- alimentada por upload mensal do arquivo "carta meta". Meta/Backlog/Esteira vêm prontos do
-- arquivo (o CRM não recalcula rateio por headcount); Concluído é editado à mão no CRM e o
-- upload nunca sobrescreve esse campo.

create table if not exists plano_comercial (
    id uuid primary key default gen_random_uuid(),
    mes_referencia date not null,
    consultor_id uuid references consultores_staff(id),
    vertical text not null check (vertical in ('APARELHO','HA','BL','MM','MB','RECEITA_TELECOM')),
    meta numeric(14,2) default 0,
    backlog numeric(14,2) default 0,
    esteira numeric(14,2) default 0,
    concluido numeric(14,2) default 0,
    atualizado_em timestamptz default now(),
    criado_em timestamptz default now(),
    unique (mes_referencia, consultor_id, vertical)
);

create table if not exists plano_comercial_config (
    vertical text primary key,
    fator_conversao numeric(4,2) not null
);
insert into plano_comercial_config (vertical, fator_conversao) values
    ('APARELHO', 0.7), ('BL', 0.7), ('HA', 0.8), ('MM', 0.8), ('MB', 0.8), ('RECEITA_TELECOM', 0.8)
on conflict (vertical) do nothing;

alter table plano_comercial enable row level security;
create policy "gestor_ve_plano_comercial" on plano_comercial for select using (is_gestor());
create policy "gestor_insere_plano_comercial" on plano_comercial for insert with check (is_gestor());
create policy "gestor_atualiza_plano_comercial" on plano_comercial for update using (is_gestor());

alter table plano_comercial_config enable row level security;
create policy "gestor_ve_config_plano_comercial" on plano_comercial_config for select using (is_gestor());
create policy "gestor_atualiza_config_plano_comercial" on plano_comercial_config for update using (is_gestor());
