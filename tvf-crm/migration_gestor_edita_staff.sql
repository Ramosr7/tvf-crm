-- consultores_staff só tinha policy de SELECT — Gestor não conseguia editar nada na tabela
-- (ex: toggle "carta meta no plano comercial"), o update era bloqueado em silêncio pelo RLS
-- (0 linhas afetadas, sem erro).

create policy "gestor_edita_staff" on consultores_staff
    for update using (is_gestor()) with check (is_gestor());
