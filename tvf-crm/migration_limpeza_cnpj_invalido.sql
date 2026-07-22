-- Limpeza de linhas órfãs criadas por imports anteriores (antes do bug do
-- detector de cabeçalho ser corrigido) — CNPJ real sempre tem 14 dígitos,
-- então qualquer coisa diferente disso é lixo de import mal interpretado.

-- 1. Confere antes de apagar (roda esse select primeiro e olha o resultado):
select id, cnpj, razao_social, consultor_id, status
from carteira_cliente
where length(cnpj) <> 14;

-- 2. Depois de confirmar que são mesmo lixo, apaga:
-- delete from carteira_cliente where length(cnpj) <> 14;
