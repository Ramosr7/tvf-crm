-- Apuração de Vendas: reconcilia venda registrada pelo consultor (pode ter quebra técnica,
-- reprova, atraso) com o resultado real de ativação, via arquivo mensal (CNPJ + ID Pedido +
-- status). ID Pedido (6 dígitos) identifica qual venda específica quando o mesmo CNPJ tem
-- mais de um pedido.

alter table carteira_venda add column if not exists numero_pedido text;
alter table carteira_venda add column if not exists status_apuracao text not null default 'pendente'
    check (status_apuracao in ('pendente', 'ativado', 'reprovado'));
alter table carteira_venda add column if not exists apurado_em timestamptz;
alter table carteira_venda add column if not exists motivo_reprova text;

-- pedido é único na empresa toda (não só por cliente) — permite null pra venda que ainda não
-- teve o número de pedido informado
create unique index if not exists idx_venda_numero_pedido on carteira_venda(numero_pedido) where numero_pedido is not null;
