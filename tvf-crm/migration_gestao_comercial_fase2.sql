-- Continuação do módulo Gestão Comercial: telas especiais de Semana 7/8/9 (itens 3.5/3.6/3.7
-- do prompt original) + suporte a feedback 360 direto pelo consultor (item 4 — a RLS de
-- gc_feedback já permitia isso desde a primeira migration, só faltava a tela).

-- ── Semana 7: Matriz de Performance (4 eixos + classificação, por consultor) ──
create table if not exists gc_matriz_performance (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references gc_semana(id),
  gestor_id uuid not null references consultores_staff(id),
  consultor_id uuid not null references consultores_staff(id),
  resultado int check (resultado between 1 and 5),
  produtividade int check (produtividade between 1 and 5),
  comportamento int check (comportamento between 1 and 5),
  evolucao int check (evolucao between 1 and 5),
  classificacao text check (classificacao in ('precisa_acelerar', 'precisa_desenvolver', 'precisa_suporte', 'pronto_autonomia')),
  atualizado_em timestamptz default now(),
  unique (semana_id, consultor_id)
);
alter table gc_matriz_performance enable row level security;
create policy "gc_matriz_perf_select" on gc_matriz_performance for select using (
  is_gestor() or is_supervisor() or gestor_id = auth.uid()
);
create policy "gc_matriz_perf_upsert" on gc_matriz_performance for insert with check (is_gestor() or gestor_id = auth.uid());
create policy "gc_matriz_perf_update" on gc_matriz_performance for update using (is_gestor() or gestor_id = auth.uid());

-- ── Semana 8: Plano Comercial do gestor (8 campos, um plano por gestor) ───────
-- nome gc_plano_acao (não "plano_comercial") de propósito — já existe uma tabela
-- plano_comercial no CRM pra Meta/Backlog/Esteira, sem relação nenhuma com essa; nome
-- diferente evita confundir as duas.
create table if not exists gc_plano_acao (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references gc_semana(id),
  gestor_id uuid not null references consultores_staff(id),
  meta text,
  gap text,
  oportunidade text,
  estrategia text,
  acao text,
  responsavel text,
  prazo date,
  kpi text,
  atualizado_em timestamptz default now(),
  unique (semana_id, gestor_id)
);
alter table gc_plano_acao enable row level security;
create policy "gc_plano_acao_select" on gc_plano_acao for select using (
  is_gestor() or is_supervisor() or gestor_id = auth.uid()
);
create policy "gc_plano_acao_upsert" on gc_plano_acao for insert with check (is_gestor() or gestor_id = auth.uid());
create policy "gc_plano_acao_update" on gc_plano_acao for update using (is_gestor() or gestor_id = auth.uid());

-- ── Semana 9: Mapeamento de Processos (item classificado) ─────────────────────
create table if not exists gc_processo (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references gc_semana(id),
  gestor_id uuid not null references consultores_staff(id),
  item text not null,
  classificacao text not null check (classificacao in ('manual', 'automatizavel', 'eliminavel', 'padronizavel')),
  criado_em timestamptz default now()
);
alter table gc_processo enable row level security;
create policy "gc_processo_select" on gc_processo for select using (
  is_gestor() or is_supervisor() or gestor_id = auth.uid()
);
create policy "gc_processo_insert" on gc_processo for insert with check (is_gestor() or gestor_id = auth.uid());
create policy "gc_processo_update" on gc_processo for update using (is_gestor() or gestor_id = auth.uid());
create policy "gc_processo_delete" on gc_processo for delete using (is_gestor() or gestor_id = auth.uid());
