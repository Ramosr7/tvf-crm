-- Radar diário às vezes traz supervisor "sem match" em consultores_staff (não é erro, é
-- produção real que precisa contar no Total Geral do Plano Comercial). Como plano_comercial
-- exige consultor_id válido (FK pra um staff cadastrado, que por sua vez exige conta real no
-- Supabase Auth), não dá pra criar um "consultor fantasma" só pra isso. Em vez disso, guarda
-- esse valor avulso numa tabela separada, sem consultor_id nenhum — o Total Geral (consolidado)
-- soma direto de plano_comercial sem filtrar por time, então basta somar essa tabela também.

create table if not exists plano_comercial_avulso (
  id uuid primary key default gen_random_uuid(),
  mes_referencia date not null,
  vertical text not null check (vertical in ('APARELHO','HA','BL','MM','MB','RECEITA_TELECOM')),
  origem text not null default 'radar_sem_match',
  backlog numeric(14,2) default 0,
  esteira numeric(14,2) default 0,
  atualizado_em timestamptz default now(),
  criado_em timestamptz default now(),
  unique (mes_referencia, vertical, origem)
);

alter table plano_comercial_avulso enable row level security;

create policy "gestor_gerencia_avulso" on plano_comercial_avulso for all
  using (is_gestor()) with check (is_gestor());
