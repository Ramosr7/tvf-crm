-- BUG: carteira_cliente nunca teve policy de INSERT — todo insert (upload mailing,
-- "Adicionar Cliente") falhava silenciosamente pro RLS. Também faltava o Gestor
-- enxergar/editar a carteira de todos (só existia policy "vê a própria").

create policy "consultor_insere_propria_carteira" on carteira_cliente
    for insert with check (consultor_id = auth.uid());

create policy "gestor_insere_carteira" on carteira_cliente
    for insert with check (is_gestor());

create policy "gestor_ve_toda_carteira" on carteira_cliente
    for select using (is_gestor());

create policy "gestor_edita_toda_carteira" on carteira_cliente
    for update using (is_gestor());
