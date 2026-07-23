-- Item 36: só Gestor (não Supervisor) pode excluir interação registrada por engano.
create policy "gestor_deleta_interacao" on carteira_interacao
    for delete using (
        exists (select 1 from consultores_staff cs where cs.id = auth.uid() and cs.perfil = 'Gestor')
    );
