-- Plano Comercial v1.1: meta/desafio viram regra fixa por time (supervisor), em vez de vir
-- do arquivo mensal — o arquivo passa a trazer só Backlog/Esteira (resultado).

alter table consultores_staff add column if not exists supervisor_id uuid references consultores_staff(id);

create table if not exists plano_comercial_meta_regra (
    id uuid primary key default gen_random_uuid(),
    supervisor_id uuid not null references consultores_staff(id),
    vertical text not null check (vertical in ('APARELHO','HA','BL','MM','MB','RECEITA_TELECOM')),
    meta numeric(14,2) not null default 0,
    desafio numeric(14,2) not null default 0,
    atualizado_em timestamptz default now(),
    unique (supervisor_id, vertical)
);

create table if not exists plano_comercial_aparelho_faixa (
    id uuid primary key default gen_random_uuid(),
    faixa integer not null unique,
    quantidade_minima numeric(14,2) not null,
    valor_remuneracao numeric(14,2) not null
);

alter table plano_comercial_meta_regra enable row level security;
create policy "gestor_crud_meta_regra" on plano_comercial_meta_regra for all using (is_gestor()) with check (is_gestor());

alter table plano_comercial_aparelho_faixa enable row level security;
create policy "gestor_crud_aparelho_faixa" on plano_comercial_aparelho_faixa for all using (is_gestor()) with check (is_gestor());

-- Meta global do escritório do mês, antes da quebra por time (bloco "PLANO COMERCIAL (s/
-- quebra)" da carta meta) — referência de entrada mensal, importada junto com o resto.
create table if not exists plano_comercial_meta_global (
    mes_referencia date not null,
    vertical text not null check (vertical in ('APARELHO','HA','BL','MM','MB','RECEITA_TELECOM')),
    meta numeric(14,2) not null default 0,
    atualizado_em timestamptz default now(),
    primary key (mes_referencia, vertical)
);

alter table plano_comercial_meta_global enable row level security;
create policy "gestor_crud_meta_global" on plano_comercial_meta_global for all using (is_gestor()) with check (is_gestor());
