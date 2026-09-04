-- Tarefa repetitiva semanal: guarda o MODELO (dias da semana, descrição, prioridade) separado
-- das instâncias do dia-a-dia. Sem cron no projeto ainda — a instância do dia é gerada na hora
-- que o consultor abre a Rotina Diária (ver MinhasTarefas.js), não de madrugada sozinho.

create table if not exists tarefa_recorrente (
  id uuid primary key default gen_random_uuid(),
  consultor_id uuid not null references consultores_staff(id),
  descricao text not null,
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta')),
  dias_semana int[] not null, -- 0=domingo ... 6=sábado (igual Date.getDay() do JS)
  ativo boolean not null default true,
  criado_por uuid references consultores_staff(id),
  criado_em timestamptz default now()
);

alter table tarefa_recorrente enable row level security;

-- mesma hierarquia de tarefa_consultor: gestor vê/cria tudo; supervisor vê/cria a si e ao
-- próprio time; consultor só a si mesmo
create policy "hierarquia_ve_recorrente" on tarefa_recorrente for select using (
  is_gestor() or consultor_id = auth.uid()
  or exists (select 1 from consultores_staff s where s.id = consultor_id and s.supervisor_id = auth.uid())
);
create policy "hierarquia_cria_recorrente" on tarefa_recorrente for insert with check (
  is_gestor() or consultor_id = auth.uid()
  or exists (select 1 from consultores_staff s where s.id = consultor_id and s.supervisor_id = auth.uid())
);
create policy "hierarquia_atualiza_recorrente" on tarefa_recorrente for update
  using (
    is_gestor() or consultor_id = auth.uid()
    or exists (select 1 from consultores_staff s where s.id = consultor_id and s.supervisor_id = auth.uid())
  )
  with check (
    is_gestor() or consultor_id = auth.uid()
    or exists (select 1 from consultores_staff s where s.id = consultor_id and s.supervisor_id = auth.uid())
  );

-- tarefa_consultor ganha o link com o modelo e a data que aquela instância representa —
-- índice único evita gerar duas vezes a tarefa do mesmo dia (ex: duas abas abertas ao mesmo
-- tempo disparando a geração juntas)
alter table tarefa_consultor add column if not exists recorrente_id uuid references tarefa_recorrente(id);
alter table tarefa_consultor add column if not exists data_referencia date;
alter table tarefa_consultor drop constraint if exists tarefa_consultor_origem_check;
alter table tarefa_consultor add constraint tarefa_consultor_origem_check check (origem in ('individual', 'coletivo', 'manual', 'recorrente'));
create unique index if not exists tarefa_consultor_recorrente_unica on tarefa_consultor (recorrente_id, data_referencia) where recorrente_id is not null;
