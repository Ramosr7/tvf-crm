-- Preenche supervisor_id (coluna já existia, nunca tinha sido usada) com o organograma real,
-- pra dar pra travar "Supervisor só cria tarefa pro próprio time" na RLS de tarefa_consultor.
-- Só cobre quem JÁ está cadastrado em consultores_staff — Nicoli Santos, Thais do Nascimento
-- (time Thiago Sousa), Luiz Roberto/Maria do Socorro/Mauricio Henriques/Ricardo Naxara/Rony
-- Franklin (time Yves Nishida) e Samuel Santos (direto do João) não têm login no CRM ainda,
-- ficam de fora até serem cadastrados.

-- Time Tiago Barbosa
update consultores_staff set supervisor_id = '5f621416-210a-4524-9640-66de43111e3a'
  where id in (
    'f099806e-561b-4e61-b1ed-0c20d0098529', -- Gilberto Andrade
    '900b6f2b-ab34-4034-bc06-ec82bb6e7fac', -- Carlos Eduardo
    'fc7f2427-2712-4bd7-9239-3542ebec11ab', -- Wagner Alencar
    '10602564-0c09-4449-92d4-0ac09031898c', -- Jhamilly Lopes
    '77d4af06-ea15-4cc3-a2eb-43a60f38ffe5', -- Rafaela Cunha
    '2af6b4b5-9075-492f-8ff7-332c3f91bd33', -- Geovana Camilly
    '2a7cbee1-2670-4542-90ab-ac215f5f82a2'  -- Laura Souza
  );

-- Time Felipe Silva
update consultores_staff set supervisor_id = '3290f265-617b-4f5d-884a-254252461165'
  where id in (
    '96c9cd10-e99a-4c74-bf18-09449d9dbe6c', -- Giovana Rodrigues
    '8cfe907b-5e00-4f6d-95db-e4a3c5ef5326', -- Carla Rodrigues
    'be69ebb2-f4f1-452d-8f2f-44a0a0c2ada1', -- Kawe Santos
    '4fb43451-b63d-4cfc-8fb8-35885c63b58c', -- Thaissa Souza
    'f28b2d1c-30f3-437b-805d-a54f58ddf5a1', -- Rodrigo Alves
    '529999e9-d592-4465-99f9-5a04160d8651', -- Victória Kamilly
    'c481f1d8-953c-4fdd-9750-3b0967007556'  -- Ecinara Lima
  );

-- Isabelle Melo reporta direto pro João (time "Consultivo" do organograma)
update consultores_staff set supervisor_id = '971645c3-b9a3-44a9-9848-5a5fa83ff8b1'
  where id = 'dc35911a-1c1e-4e04-8ab4-1f9f38a625ea';

-- tarefa_consultor: adiciona prazo/prioridade, e "manual" como novo tipo de origem (tarefa
-- criada por gestor/supervisor na hora, não só gerada pela Análise com IA)
alter table tarefa_consultor add column if not exists prazo date;
alter table tarefa_consultor add column if not exists prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta'));
alter table tarefa_consultor drop constraint if exists tarefa_consultor_origem_check;
alter table tarefa_consultor add constraint tarefa_consultor_origem_check check (origem in ('individual', 'coletivo', 'manual'));

-- troca a policy de insert: além do gestor (que continua podendo criar pra qualquer um), agora
-- também vale "criar pra mim mesmo" e "criar pro consultor que eu superviso" (via supervisor_id)
drop policy if exists "gestor_cria_tarefas" on tarefa_consultor;
create policy "hierarquia_cria_tarefa" on tarefa_consultor for insert with check (
  is_gestor()
  or consultor_id = auth.uid()
  or exists (
    select 1 from consultores_staff s
    where s.id = consultor_id and s.supervisor_id = auth.uid()
  )
);

-- supervisor também precisa VER as tarefas que ele mesmo atribuiu pro time, não só as próprias
-- (a policy "consultor_ve_proprias_tarefas" só cobre auth.uid() = consultor_id)
create policy "supervisor_ve_tarefas_do_time" on tarefa_consultor for select using (
  exists (
    select 1 from consultores_staff s
    where s.id = consultor_id and s.supervisor_id = auth.uid()
  )
);
