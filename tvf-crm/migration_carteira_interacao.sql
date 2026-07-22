-- Log de interações por cliente da carteira, estilo chat (append-only,
-- pra depois servir de insumo pra relatório via IA).

create table if not exists carteira_interacao (
    id uuid primary key default gen_random_uuid(),
    carteira_cliente_id uuid references carteira_cliente(id) on delete cascade,
    autor_id uuid references consultores_staff(id),
    descricao text not null,
    criado_em timestamptz default now()
);

create index if not exists idx_carteira_interacao_cliente on carteira_interacao(carteira_cliente_id);

alter table carteira_interacao enable row level security;

create policy "consultor_ve_propria_interacao" on carteira_interacao
    for select using (
        exists (select 1 from carteira_cliente cc where cc.id = carteira_cliente_id and cc.consultor_id = auth.uid())
    );
create policy "consultor_insere_propria_interacao" on carteira_interacao
    for insert with check (
        exists (select 1 from carteira_cliente cc where cc.id = carteira_cliente_id and cc.consultor_id = auth.uid())
        and autor_id = auth.uid()
    );

create policy "gestor_ve_toda_interacao" on carteira_interacao for select using (is_gestor());
create policy "gestor_insere_toda_interacao" on carteira_interacao for insert with check (is_gestor() and autor_id = auth.uid());
