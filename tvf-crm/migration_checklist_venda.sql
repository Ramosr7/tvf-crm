-- Checklist de venda: quando o consultor avança um cliente pra "Venda Realizada"
-- ou "Pedido Finalizado", responde um checklist rápido por pilar de potencial
-- (ofereceu? qual foi a justificativa?).

create table if not exists carteira_checklist_venda (
    id uuid primary key default gen_random_uuid(),
    carteira_cliente_id uuid references carteira_cliente(id) on delete cascade,
    pilar text not null,
    ofereceu boolean not null default false,
    justificativa text,
    autor_id uuid references consultores_staff(id),
    criado_em timestamptz default now()
);

create index if not exists idx_checklist_venda_cliente on carteira_checklist_venda(carteira_cliente_id);

alter table carteira_checklist_venda enable row level security;

create policy "consultor_ve_propria_checklist" on carteira_checklist_venda
    for select using (
        exists (select 1 from carteira_cliente cc where cc.id = carteira_cliente_id and cc.consultor_id = auth.uid())
    );
create policy "consultor_insere_propria_checklist" on carteira_checklist_venda
    for insert with check (
        exists (select 1 from carteira_cliente cc where cc.id = carteira_cliente_id and cc.consultor_id = auth.uid())
        and autor_id = auth.uid()
    );
create policy "consultor_deleta_propria_checklist" on carteira_checklist_venda
    for delete using (
        exists (select 1 from carteira_cliente cc where cc.id = carteira_cliente_id and cc.consultor_id = auth.uid())
    );

create policy "gestor_ve_toda_checklist" on carteira_checklist_venda for select using (is_gestor());
create policy "gestor_insere_toda_checklist" on carteira_checklist_venda for insert with check (is_gestor() and autor_id = auth.uid());
create policy "gestor_deleta_toda_checklist" on carteira_checklist_venda for delete using (is_gestor());
