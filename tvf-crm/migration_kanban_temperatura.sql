-- Kanban de Temperatura: flag manual (no_kanban) + campo de temperatura,
-- independente do status/pipeline do CRM5. Consultor flaga o cliente pra
-- ele aparecer no Kanban e depois controla a temperatura arrastando o card.

alter table carteira_cliente add column if not exists no_kanban boolean default false;
alter table carteira_cliente add column if not exists temperatura text
  check (temperatura in ('Frio','Morno','Quente','Descartado') or temperatura is null);

-- Prazo por temperatura: guarda quando a temperatura mudou pela última vez,
-- pra calcular quantos dias o cliente está parado ali (item 16).
alter table carteira_cliente add column if not exists temperatura_atualizada_em timestamptz;
