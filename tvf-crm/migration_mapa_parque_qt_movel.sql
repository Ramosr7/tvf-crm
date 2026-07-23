-- Quantidade real de linhas móveis ativas do cliente (QT_MOVEL_TERM do export InfoB2B).
-- Usada pra contar o potencial de migração em casos de renovação/blindagem (rec_movel sem
-- número explícito) — antes contava fixo "1", mas o parque móvel do cliente pode ter várias linhas.
alter table mapa_parque_import
  add column if not exists qt_movel_term integer default 0;
