-- v4: o constraint ficou desatualizado — "Aguardando Atendimento" e "Recontato — Nova Venda"
-- já existiam em STATUS_OPCOES no código (PotencialCarteira.js) mas nunca entraram aqui,
-- então salvar esses status dava "violates check constraint carteira_cliente_status_check".

alter table carteira_cliente drop constraint if exists carteira_cliente_status_check;
alter table carteira_cliente add constraint carteira_cliente_status_check
  check (status in (
    'Aguardando Aceite','Aguardando Atendimento','Cliente Cancelou','Cliente Já Renovado','CNPJ Baixado',
    'Débito Interno','Já Possui Consultor','Não Contatar','Não Possui Recomendação',
    'Pedido Finalizado','Proposta Enviada','Recontato — Nova Venda','Retornar','Sem Contato Efetivo',
    'Sem Interesse','Sem Viabilidade','Venda Realizada'
  ));
