-- Substitui o campo único "Produto Vendido" por múltiplos itens por venda
-- (produto + tipo Novo/Renovação + quantidade + valor cada).

create table if not exists carteira_venda_item (
    id uuid primary key default gen_random_uuid(),
    carteira_cliente_id uuid references carteira_cliente(id) on delete cascade,
    subproduto text not null,
    tipo text not null check (tipo in ('Novo','Renovação')),
    quantidade integer default 1,
    valor numeric(12,2) default 0,
    criado_em timestamptz default now()
);

create index if not exists idx_venda_item_cliente on carteira_venda_item(carteira_cliente_id);

alter table carteira_venda_item enable row level security;

create policy "consultor_ve_propria_venda_item" on carteira_venda_item
    for select using (
        exists (select 1 from carteira_cliente cc where cc.id = carteira_cliente_id and cc.consultor_id = auth.uid())
    );
create policy "consultor_insere_propria_venda_item" on carteira_venda_item
    for insert with check (
        exists (select 1 from carteira_cliente cc where cc.id = carteira_cliente_id and cc.consultor_id = auth.uid())
    );
create policy "consultor_deleta_propria_venda_item" on carteira_venda_item
    for delete using (
        exists (select 1 from carteira_cliente cc where cc.id = carteira_cliente_id and cc.consultor_id = auth.uid())
    );

create policy "gestor_ve_toda_venda_item" on carteira_venda_item for select using (is_gestor());
create policy "gestor_insere_toda_venda_item" on carteira_venda_item for insert with check (is_gestor());
create policy "gestor_deleta_toda_venda_item" on carteira_venda_item for delete using (is_gestor());
