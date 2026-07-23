-- Item 35: nao apagar cliente de verdade, so marcar como excluido (soft delete)
-- pra poder restaurar ("Ctrl Z") se apagar sem querer.
alter table carteira_cliente add column if not exists excluido_em timestamptz;
alter table carteira_cliente add column if not exists excluido_por uuid references consultores_staff(id);
create index if not exists idx_carteira_cliente_excluido on carteira_cliente(excluido_em);
