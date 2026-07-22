-- BUG: carteira_cliente nunca teve policy de DELETE — remover cliente nunca
-- funcionou de verdade (falhava silencioso pro RLS), nem pra Gestor/Supervisor.

create policy "gestor_deleta_toda_carteira" on carteira_cliente
    for delete using (is_gestor());
