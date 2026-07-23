-- O soft delete (item 35) manteve as linhas "removidas" na tabela (só marca
-- excluido_em), mas o índice único idx_carteira_cnpj_consultor(cnpj, consultor_id)
-- não sabe disso e continua bloqueando reinserir o mesmo CNPJ pro mesmo consultor
-- mesmo depois de removido -- causa "duplicate key value violates unique
-- constraint idx_carteira_cnpj_consultor" ao reimportar Status Atual/Mailing.
--
-- Troca por um índice único parcial: só vale entre as linhas ainda ativas.
drop index if exists idx_carteira_cnpj_consultor;
create unique index idx_carteira_cnpj_consultor on carteira_cliente(cnpj, consultor_id)
  where excluido_em is null;
