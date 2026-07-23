-- A tela "Processar Mapa Parque" trava porque o UPDATE que marca processado=true
-- estava sendo bloqueado pelo RLS (nenhuma policy de UPDATE nessa tabela) -- o
-- Supabase retorna 0 linhas afetadas em silêncio, então o loop reprocessava o
-- mesmo lote pra sempre sem nunca avançar de verdade.
alter table mapa_parque_import enable row level security;

drop policy if exists "gestor_atualiza_mapa_parque" on mapa_parque_import;
create policy "gestor_atualiza_mapa_parque" on mapa_parque_import
  for update using (is_gestor()) with check (is_gestor());

drop policy if exists "gestor_le_mapa_parque" on mapa_parque_import;
create policy "gestor_le_mapa_parque" on mapa_parque_import
  for select using (is_gestor());

drop policy if exists "gestor_insere_mapa_parque" on mapa_parque_import;
create policy "gestor_insere_mapa_parque" on mapa_parque_import
  for insert with check (is_gestor());
