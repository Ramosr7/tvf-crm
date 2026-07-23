-- Item 28: identificar de onde veio o cliente (mailing diário vs migração de
-- planilha antiga vs manual), pra poder filtrar sem misturar.
alter table carteira_cliente add column if not exists origem text;

-- Item 29: novo status "Aguardando Atendimento" (separado de "Aguardando Aceite",
-- que continua existindo com seu próprio significado).
alter table carteira_cliente drop constraint if exists carteira_cliente_status_check;
alter table carteira_cliente add constraint carteira_cliente_status_check
  check (status in (
    'Aguardando Aceite','Aguardando Atendimento','Cliente Cancelou','Cliente Já Renovado','CNPJ Baixado',
    'Débito Interno','Já Possui Consultor','Não Contatar','Não Possui Recomendação',
    'Pedido Finalizado','Proposta Enviada','Retornar','Sem Contato Efetivo',
    'Sem Interesse','Sem Viabilidade','Venda Realizada'
  ));

-- Item 27: lembrete manual de retorno (consultor escolhe data + produto/pilar + nota).
create table if not exists carteira_lembrete (
    id uuid primary key default gen_random_uuid(),
    carteira_cliente_id uuid references carteira_cliente(id) on delete cascade,
    data_hora timestamptz not null,
    pilar text,
    nota text,
    concluido boolean default false,
    autor_id uuid references consultores_staff(id),
    criado_em timestamptz default now()
);

create index if not exists idx_lembrete_cliente on carteira_lembrete(carteira_cliente_id);
create index if not exists idx_lembrete_data on carteira_lembrete(data_hora);

alter table carteira_lembrete enable row level security;

create policy "consultor_ve_propria_lembrete" on carteira_lembrete
    for select using (
        exists (select 1 from carteira_cliente cc where cc.id = carteira_cliente_id and cc.consultor_id = auth.uid())
    );
create policy "consultor_insere_propria_lembrete" on carteira_lembrete
    for insert with check (
        exists (select 1 from carteira_cliente cc where cc.id = carteira_cliente_id and cc.consultor_id = auth.uid())
        and autor_id = auth.uid()
    );
create policy "consultor_atualiza_propria_lembrete" on carteira_lembrete
    for update using (
        exists (select 1 from carteira_cliente cc where cc.id = carteira_cliente_id and cc.consultor_id = auth.uid())
    );
create policy "consultor_deleta_propria_lembrete" on carteira_lembrete
    for delete using (
        exists (select 1 from carteira_cliente cc where cc.id = carteira_cliente_id and cc.consultor_id = auth.uid())
    );

create policy "gestor_ve_toda_lembrete" on carteira_lembrete for select using (is_gestor());
create policy "gestor_insere_toda_lembrete" on carteira_lembrete for insert with check (is_gestor() and autor_id = auth.uid());
create policy "gestor_atualiza_toda_lembrete" on carteira_lembrete for update using (is_gestor());
create policy "gestor_deleta_toda_lembrete" on carteira_lembrete for delete using (is_gestor());

-- Item 29 (retroativo): todo cliente que hoje está "Aguardando Aceite" passa
-- para "Aguardando Atendimento". Rodar DEPOIS que o ADD CONSTRAINT acima já
-- tiver sido aplicado (senão o novo valor de status é rejeitado).
update carteira_cliente set status = 'Aguardando Atendimento'
where status = 'Aguardando Aceite';
