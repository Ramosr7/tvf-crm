-- Supervisor hoje não tem nenhuma policy de RLS própria em consultores_staff, carteira_cliente
-- e rotina_diaria — só existem policies de "dono" (consultor_id/id = auth.uid()) e is_gestor().
-- Resultado: Supervisor não vê o próprio time em lugar nenhum (Rotina Diária, Potencial de
-- Carteira, Tarefas, Dashboard), só o próprio cadastro. Mesmo padrão já usado em
-- "supervisor_ve_tarefas_do_time" (migration_tarefas_hierarquia.sql), agora replicado.

-- consultores_staff: Supervisor vê quem tem supervisor_id apontando pra ele
create policy "supervisor_ve_seu_time" on consultores_staff for select using (
  supervisor_id = auth.uid()
);

-- carteira_cliente: Supervisor vê/edita carteira dos consultores do próprio time
create policy "supervisor_ve_carteira_do_time" on carteira_cliente for select using (
  exists (select 1 from consultores_staff s where s.id = consultor_id and s.supervisor_id = auth.uid())
);
create policy "supervisor_edita_carteira_do_time" on carteira_cliente for update
  using (exists (select 1 from consultores_staff s where s.id = consultor_id and s.supervisor_id = auth.uid()))
  with check (exists (select 1 from consultores_staff s where s.id = consultor_id and s.supervisor_id = auth.uid()));
create policy "supervisor_insere_carteira_do_time" on carteira_cliente for insert with check (
  consultor_id = auth.uid()
  or exists (select 1 from consultores_staff s where s.id = consultor_id and s.supervisor_id = auth.uid())
);

-- rotina_diaria: Supervisor vê/valida a rotina dos consultores do próprio time
create policy "supervisor_ve_rotina_do_time" on rotina_diaria for select using (
  exists (select 1 from consultores_staff s where s.id = consultor_id and s.supervisor_id = auth.uid())
);
create policy "supervisor_atualiza_rotina_do_time" on rotina_diaria for update using (
  exists (select 1 from consultores_staff s where s.id = consultor_id and s.supervisor_id = auth.uid())
);
create policy "supervisor_insere_rotina_do_time" on rotina_diaria for insert with check (
  exists (select 1 from consultores_staff s where s.id = consultor_id and s.supervisor_id = auth.uid())
);
