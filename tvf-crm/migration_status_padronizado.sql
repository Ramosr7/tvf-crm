-- v3: adiciona "Venda Realizada" de volta como status distinto de "Pedido Finalizado"
-- (venda fechada != processo/pedido finalizado, são etapas diferentes).

alter table carteira_cliente drop constraint if exists carteira_cliente_status_check;
alter table carteira_cliente add constraint carteira_cliente_status_check
  check (status in (
    'Aguardando Aceite','Cliente Cancelou','Cliente Já Renovado','CNPJ Baixado',
    'Débito Interno','Já Possui Consultor','Não Contatar','Não Possui Recomendação',
    'Pedido Finalizado','Proposta Enviada','Retornar','Sem Contato Efetivo',
    'Sem Interesse','Sem Viabilidade','Venda Realizada'
  ));
