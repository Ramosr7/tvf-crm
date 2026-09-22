-- Módulo "Gestão Comercial de Alta Performance" — programa de 90 dias (12 semanas) de
-- acompanhamento executivo do João com os 3 supervisores (Tiago, Felipe, Yves).
-- Mapeamento de papel: o "Gestor" do prompt/slide = perfil 'Supervisor' no nosso schema
-- (Tiago/Felipe/Yves); o "João (admin)" do prompt = perfil 'Gestor' aqui (só o João, via
-- is_gestor()). Consultor não tem tela própria nesse primeiro módulo — só responde 360 quando
-- convidado (ver política de insert em gc_feedback).

-- helper: mesmo padrão de is_gestor(), pros 3 supervisores terem visão cruzada (transparência,
-- sem edição) do progresso um do outro — exigência explícita do prompt (seção 5.1).
create or replace function is_supervisor()
returns boolean language sql stable as $$
  select exists (select 1 from consultores_staff where id = auth.uid() and perfil = 'Supervisor')
$$;

-- ── 1) as 12 semanas do programa ──────────────────────────────────────────────
create table if not exists gc_semana (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique check (numero between 1 and 12),
  fase text not null check (fase in ('fase_1', 'fase_2', 'fase_3')),
  data_inicio date not null,
  data_fim date not null,
  objetivo text,
  tema_central text
);
alter table gc_semana enable row level security;
create policy "staff_ve_semanas" on gc_semana for select using (
  exists (select 1 from consultores_staff where id = auth.uid())
);
create policy "gestor_gerencia_semanas" on gc_semana for all using (is_gestor()) with check (is_gestor());

-- ── 2) reunião de segunda / checkpoint de sexta ───────────────────────────────
create table if not exists gc_reuniao (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references gc_semana(id),
  gestor_id uuid references consultores_staff(id), -- null = reunião geral (todos os 3 juntos)
  tipo text not null check (tipo in ('segunda', 'sexta')),
  data date,
  respostas jsonb not null default '{}'::jsonb,
  realizada boolean not null default false,
  criado_em timestamptz default now()
);
alter table gc_reuniao enable row level security;
create policy "gc_reuniao_select" on gc_reuniao for select using (
  is_gestor() or is_supervisor() or gestor_id = auth.uid()
);
create policy "gc_reuniao_upsert" on gc_reuniao for insert with check (is_gestor() or gestor_id = auth.uid());
create policy "gc_reuniao_update" on gc_reuniao for update using (is_gestor() or gestor_id = auth.uid());

-- ── 3) feedback estruturado + 360 ─────────────────────────────────────────────
create table if not exists gc_feedback (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references gc_semana(id),
  gestor_id uuid not null references consultores_staff(id),
  consultor_id uuid not null references consultores_staff(id),
  tipo text not null check (tipo in ('estruturado', '360')),
  situacao text,
  fato text,
  comportamento text,
  impacto text,
  expectativa text,
  acordo text,
  prazo date,
  acompanhamento date,
  acompanhamento_feito boolean not null default false,
  data_registro timestamptz default now()
);
alter table gc_feedback enable row level security;
create policy "gc_feedback_select" on gc_feedback for select using (
  is_gestor() or is_supervisor() or gestor_id = auth.uid() or consultor_id = auth.uid()
);
-- estruturado: só o gestor (Tiago/Felipe/Yves) cria, sobre um consultor seu.
-- 360: o consultor cria, sobre o próprio gestor (situação inversa do mesmo formulário).
create policy "gc_feedback_insert" on gc_feedback for insert with check (
  is_gestor()
  or (tipo = 'estruturado' and gestor_id = auth.uid())
  or (tipo = '360' and consultor_id = auth.uid())
);
create policy "gc_feedback_update" on gc_feedback for update using (
  is_gestor() or gestor_id = auth.uid() or consultor_id = auth.uid()
);

-- ── 4) indicador semanal por gestor ───────────────────────────────────────────
create table if not exists gc_indicador (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references gc_semana(id),
  gestor_id uuid not null references consultores_staff(id),
  nome text not null,
  valor numeric,
  meta numeric,
  fonte text not null default 'manual' check (fonte in ('manual', 'importado')),
  criado_em timestamptz default now()
);
alter table gc_indicador enable row level security;
create policy "gc_indicador_select" on gc_indicador for select using (
  is_gestor() or is_supervisor() or gestor_id = auth.uid()
);
create policy "gc_indicador_insert" on gc_indicador for insert with check (is_gestor() or gestor_id = auth.uid());
create policy "gc_indicador_update" on gc_indicador for update using (is_gestor() or gestor_id = auth.uid());

-- ── 5) entregáveis por fase (checklist que substitui o slide) ─────────────────
create table if not exists gc_entregavel (
  id uuid primary key default gen_random_uuid(),
  fase text not null check (fase in ('fase_1', 'fase_2', 'fase_3')),
  descricao text not null,
  status text not null default 'pendente' check (status in ('pendente', 'em_andamento', 'entregue')),
  evidencia_url text,
  gestor_id uuid references consultores_staff(id)
);
alter table gc_entregavel enable row level security;
create policy "staff_ve_entregaveis" on gc_entregavel for select using (
  exists (select 1 from consultores_staff where id = auth.uid())
);
create policy "gc_entregavel_upsert" on gc_entregavel for insert with check (is_gestor() or gestor_id = auth.uid());
create policy "gc_entregavel_update" on gc_entregavel for update using (is_gestor() or gestor_id = auth.uid());

-- ── 6) matriz de responsabilidade (ação específica da semana por gestor) ──────
create table if not exists gc_matriz_responsabilidade (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references gc_semana(id),
  gestor_id uuid not null references consultores_staff(id),
  acao_especifica text not null,
  status text not null default 'pendente' check (status in ('pendente', 'feito'))
);
alter table gc_matriz_responsabilidade enable row level security;
create policy "gc_matriz_select" on gc_matriz_responsabilidade for select using (
  is_gestor() or is_supervisor() or gestor_id = auth.uid()
);
create policy "gc_matriz_insert" on gc_matriz_responsabilidade for insert with check (is_gestor());
create policy "gc_matriz_update" on gc_matriz_responsabilidade for update using (is_gestor() or gestor_id = auth.uid());

-- ── 7) roteiro/diagnóstico semente por semana (conteúdo configurável) ─────────
create table if not exists gc_template_roteiro (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references gc_semana(id),
  tipo text not null check (tipo in ('diagnostico', 'roteiro_segunda', 'exercicio')),
  perguntas jsonb not null default '[]'::jsonb
);
alter table gc_template_roteiro enable row level security;
create policy "staff_ve_templates" on gc_template_roteiro for select using (
  exists (select 1 from consultores_staff where id = auth.uid())
);
create policy "gestor_gerencia_templates" on gc_template_roteiro for all using (is_gestor()) with check (is_gestor());

-- ── seed: calendário real das 12 semanas (seção 6.3 do prompt) ────────────────
insert into gc_semana (numero, fase, data_inicio, data_fim, objetivo, tema_central) values
  (1,  'fase_1', '2026-09-22', '2026-09-25', 'Kickoff e diagnóstico', 'Fundação — por que e como'),
  (2,  'fase_1', '2026-09-28', '2026-10-02', null, null),
  (3,  'fase_1', '2026-10-05', '2026-10-09', null, null),
  (4,  'fase_1', '2026-10-12', '2026-10-16', null, null),
  (5,  'fase_2', '2026-10-19', '2026-10-23', null, null),
  (6,  'fase_2', '2026-10-26', '2026-10-30', null, null),
  (7,  'fase_2', '2026-11-02', '2026-11-06', 'Matriz de performance', null),
  (8,  'fase_2', '2026-11-09', '2026-11-13', 'Plano comercial', null),
  (9,  'fase_3', '2026-11-16', '2026-11-20', 'Mapeamento de processos', null),
  (10, 'fase_3', '2026-11-23', '2026-11-27', null, null),
  (11, 'fase_3', '2026-11-30', '2026-12-04', null, null),
  (12, 'fase_3', '2026-12-07', '2026-12-11', 'Playbook TVF', 'Consolidação — Demo Day em 14/12')
on conflict (numero) do nothing;

-- ── seed: entregáveis Fase 1 (exemplo dado no prompt, seção 4.1) ──────────────
insert into gc_entregavel (fase, descricao) values
  ('fase_1', 'Calendário de gestão'),
  ('fase_1', 'Rotina documentada'),
  ('fase_1', 'Indicadores definidos'),
  ('fase_1', 'Modelo de reunião e feedback'),
  ('fase_1', 'Diagnóstico inicial')
on conflict do nothing;

-- ── seed: roteiro da Semana 1 (seção 6.1 do prompt — literal, não inventado) ──
insert into gc_template_roteiro (semana_id, tipo, perguntas)
select id, 'diagnostico', '[
  "Como eu faço gestão hoje?",
  "Qual é minha rotina atual?",
  "Como sei se meu time performa?",
  "Como acompanho as oportunidades?",
  "Como acompanho os consultores?",
  "Como eu dou feedback?",
  "Como planejo minha semana?",
  "Qual meu maior problema como gestor?",
  "O que preciso desenvolver em mim?",
  "O que quero mudar em 90 dias?"
]'::jsonb
from gc_semana where numero = 1
on conflict do nothing;

insert into gc_template_roteiro (semana_id, tipo, perguntas)
select id, 'roteiro_segunda', '[
  "Por que o projeto existe",
  "Diagnóstico atual",
  "O que é constância",
  "O que se espera do gestor",
  "Como funcionam os 90 dias",
  "Como serão medidos",
  "Responsabilidade de cada um"
]'::jsonb
from gc_semana where numero = 1
on conflict do nothing;
