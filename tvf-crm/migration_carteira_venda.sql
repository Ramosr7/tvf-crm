-- Permite múltiplas vendas ao longo do tempo pro mesmo cliente (recontato/upsell), sem perder
-- o histórico da venda anterior. Cada "fechamento" de venda vira uma linha em carteira_venda;
-- os itens (carteira_venda_item) passam a apontar pra ela, não mais só pro cliente.

create table if not exists carteira_venda (
    id uuid primary key default gen_random_uuid(),
    carteira_cliente_id uuid references carteira_cliente(id) on delete cascade,
    consultor_id uuid references consultores_staff(id),
    data_venda date not null default current_date,
    criado_em timestamptz default now()
);

create index if not exists idx_venda_cliente on carteira_venda(carteira_cliente_id);

alter table carteira_venda_item add column if not exists carteira_venda_id uuid references carteira_venda(id) on delete cascade;

-- backfill: cliente já fechado ganha 1 venda retroativa, e os itens que já tinha se ligam a ela
insert into carteira_venda (carteira_cliente_id, consultor_id, data_venda, criado_em)
select id, consultor_id, coalesce(data_venda, current_date), now()
from carteira_cliente
where status in ('Venda Realizada', 'Pedido Finalizado')
  and not exists (select 1 from carteira_venda v where v.carteira_cliente_id = carteira_cliente.id);

update carteira_venda_item vi
set carteira_venda_id = v.id
from carteira_venda v
where v.carteira_cliente_id = vi.carteira_cliente_id
  and vi.carteira_venda_id is null;

alter table carteira_venda enable row level security;

create policy "consultor_ve_propria_venda" on carteira_venda
    for select using (consultor_id = auth.uid());
create policy "consultor_insere_propria_venda" on carteira_venda
    for insert with check (consultor_id = auth.uid());
create policy "consultor_atualiza_propria_venda" on carteira_venda
    for update using (consultor_id = auth.uid());

create policy "gestor_ve_toda_venda" on carteira_venda for select using (is_gestor());
create policy "gestor_insere_toda_venda" on carteira_venda for insert with check (is_gestor());
create policy "gestor_atualiza_toda_venda" on carteira_venda for update using (is_gestor());
