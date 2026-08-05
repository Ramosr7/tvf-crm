-- Corrige CNPJ com 13 dígitos (faltando o zero à esquerda) — acontece quando a planilha de
-- origem guarda o CNPJ como número em vez de texto, e o Excel derruba o zero inicial.
-- Só mexe em valor com exatamente 13 dígitos puros; e só se o valor corrigido (14 dígitos)
-- ainda não existir pra esse mesmo consultor, pra não violar o índice único
-- idx_carteira_cnpj_consultor(cnpj, consultor_id).

update carteira_cliente c
set cnpj = lpad(c.cnpj, 14, '0')
where c.cnpj ~ '^[0-9]{13}$'
  and not exists (
    select 1 from carteira_cliente c2
    where c2.consultor_id = c.consultor_id
      and c2.cnpj = lpad(c.cnpj, 14, '0')
      and c2.id <> c.id
  );
