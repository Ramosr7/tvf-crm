-- Popula o conteúdo real das 12 semanas + matriz de responsabilidade (Tiago/Felipe/Yves),
-- transcrito do "TVF - Playbook de Execução Semana a Semana (90 Dias)" — nada inventado.
-- Mapeamento de papel confirmado antes: "Gestor" do playbook = perfil 'Supervisor' aqui.

-- ── gc_semana ganha os campos que faltavam pra fechar os "12 campos fixos" por semana ──
alter table gc_semana add column if not exists reuniao_segunda text;
alter table gc_semana add column if not exists exercicio_pratico text;
alter table gc_semana add column if not exists tarefa_gestores text;
alter table gc_semana add column if not exists aplicacao_consultores text;
alter table gc_semana add column if not exists o_que_observar text;
alter table gc_semana add column if not exists indicador_sugerido text;
alter table gc_semana add column if not exists checkpoint_sexta text;
alter table gc_semana add column if not exists entrega_esperada text;
alter table gc_semana add column if not exists criterio_sucesso text;
alter table gc_semana add column if not exists proximo_passo text;

-- Semana 1 — Diagnóstico + Contrato de Gestão
update gc_semana set
  objetivo = 'Criar consciência sobre o papel do gestor e estabelecer o ponto de partida do projeto',
  tema_central = 'Diagnóstico e contrato de gestão',
  reuniao_segunda = 'Reunião de abertura (60 min, substitui a reunião de segunda por não cair numa segunda-feira). Roteiro literal: 1. Por que o projeto existe — cresceu sem rotina, decisão por achismo. 2. Diagnóstico atual — consultor não sabe a própria meta, gestor sem número de cor. 3. O que é constância — fazer certo toda semana, não só uma vez. 4. O que se espera do gestor — rodar rotina, usar dado, dar feedback, cascatear. 5. Como funcionam os 90 dias — 12 semanas, 3 fases, checkpoint toda sexta. 6. Como serão medidos — indicador próprio definido já nesta semana. 7. Responsabilidade de cada um — João direciona, gestor executa e cascateia, consultor executa.',
  exercicio_pratico = 'Cada gestor responde sozinho, por escrito, as 10 perguntas do autodiagnóstico: 1. Como eu faço gestão hoje? 2. Qual é minha rotina atual? 3. Como sei se meu time performa? 4. Como acompanho as oportunidades? 5. Como acompanho os consultores? 6. Como eu dou feedback? 7. Como planejo minha semana? 8. Qual meu maior problema como gestor? 9. O que preciso desenvolver em mim? 10. O que quero mudar em 90 dias?',
  tarefa_gestores = 'Construir o Diagnóstico Individual de Gestão e preencher um diário de rotina (Horário | Atividade | Objetivo | Resultado) durante a semana',
  aplicacao_consultores = 'Nenhuma ainda — semana é exclusiva de diagnóstico com os gestores',
  o_que_observar = 'Ouvir, identificar padrões, identificar diferenças, identificar gaps, registrar pontos de desenvolvimento. Não corrigir tudo nesta primeira reunião — primeiro entender',
  indicador_sugerido = 'Diagnósticos individuais entregues (3 de 3 gestores) e diário de rotina preenchido',
  checkpoint_sexta = 'O que você descobriu sobre sua própria rotina? O que ocupa mais tempo? O que deveria ocupar mais tempo? O que deveria deixar de fazer? Onde existe maior desperdício? Qual o principal gap de gestão?',
  entrega_esperada = 'Mapa inicial da rotina de cada gestor',
  criterio_sucesso = 'Os 3 gestores entregaram diagnóstico e diário completos; João identificou ao menos 1 gap por gestor',
  proximo_passo = 'Semana 2 — transformar o diagnóstico em rotina mínima de gestão'
where numero = 1;

-- Semana 2 — Construção da Rotina
update gc_semana set
  objetivo = 'Transformar o diagnóstico em uma rotina mínima de gestão',
  tema_central = 'Rotina diária, semanal e mensal',
  reuniao_segunda = 'João apresenta a estrutura: Diário → gestão dos consultores; Segunda → direcionamento; Sexta → fechamento e planejamento; Mensal → avaliação estratégica',
  exercicio_pratico = 'Cada gestor constrói sua própria agenda semanal de gestão, contendo matinal, acompanhamento, análise de indicadores, acompanhamento de oportunidades, feedback, desenvolvimento e fechamento',
  tarefa_gestores = 'Preencher a Agenda Executiva do Gestor e implementá-la ao longo da semana',
  aplicacao_consultores = 'O gestor comunica a nova rotina (dias e horários dos rituais) aos consultores, sem ainda formalizar a matinal com roteiro',
  o_que_observar = 'Não precisa acompanhar tudo. Observa se o ritual aconteceu, se foi objetivo, se houve direcionamento, acompanhamento, registro e plano de ação',
  indicador_sugerido = 'Agendas executivas entregues (3 de 3) e número de dias da semana em que a rotina proposta foi seguida',
  checkpoint_sexta = 'Retrospectiva: o que funcionou? O que não funcionou? O que foi difícil? O que precisa ser ajustado?',
  entrega_esperada = 'Versão 2 da rotina (agenda ajustada)',
  criterio_sucesso = 'Cada gestor rodou a rotina proposta em pelo menos 3 dos 5 dias úteis',
  proximo_passo = 'Semana 3 — transformar as reuniões da rotina em rituais de gestão de verdade, com matinal estruturada'
where numero = 2;

-- Semana 3 — Rituais de Gestão
update gc_semana set
  objetivo = 'Criar reuniões que gerem execução, não apenas informação',
  tema_central = 'Matinal, acompanhamento, feedback, fechamento',
  reuniao_segunda = 'João revisa com os gestores o roteiro padronizado de matinal: resultado atual, meta, prioridade, oportunidades, gargalos, quem precisa de ajuda, compromissos do dia',
  exercicio_pratico = 'Cada gestor conduz uma matinal diária com os consultores usando o roteiro padronizado de 7 pontos',
  tarefa_gestores = 'Rodar a matinal diariamente com a própria equipe seguindo o roteiro',
  aplicacao_consultores = 'Consultores participam da matinal diária pela primeira vez com estrutura formal: resultado, meta, prioridade, gargalos, compromissos do dia',
  o_que_observar = 'Observa pessoalmente uma matinal de cada gestor. O feedback não pode ser "foi bom" — precisa responder: o que funcionou, o que poderia ser melhor, o gestor direcionou ou apenas informou, houve clareza, houve cobrança, houve ação',
  indicador_sugerido = 'Número de matinais realizadas na semana por gestor (meta: 5 de 5 dias úteis)',
  checkpoint_sexta = 'João dá feedback estruturado a cada gestor sobre a matinal que observou',
  entrega_esperada = '"Modelo de Matinal TVF" documentado e validado',
  criterio_sucesso = 'Os 3 gestores rodaram matinal em pelo menos 4 dos 5 dias, cobrindo os 7 pontos do roteiro',
  proximo_passo = 'Semana 4 — usar dados reais para embasar as decisões da matinal e fechar o checkpoint de 30 dias'
where numero = 3;

-- Semana 4 — Dados + Checkpoint 30
update gc_semana set
  objetivo = 'Fazer o gestor começar a tomar decisões utilizando dados',
  tema_central = 'Gestão por dados',
  reuniao_segunda = 'João conduz a construção do Plano de Ação do Gestor a partir de 7 perguntas: qual minha meta, quanto entreguei, qual o gap, onde estou perdendo, qual consultor precisa de atenção, qual oportunidade está parada, qual ação será tomada',
  exercicio_pratico = 'Cada gestor responde as 7 perguntas usando dados reais do mês e monta o plano de ação',
  tarefa_gestores = 'Entregar o Plano de Ação do Gestor com pelo menos 1 ação por consultor em atenção',
  aplicacao_consultores = 'Gestor comunica individualmente a cada consultor prioritário qual é a ação e a expectativa da semana, com base no plano de ação',
  o_que_observar = 'Se o gestor está de fato olhando o dado antes de decidir, ou ainda decidindo por achismo',
  indicador_sugerido = 'Planos de ação entregues com dado real anexado, não estimativa',
  checkpoint_sexta = 'Checkpoint 30 dias: João + gestores avaliam Rotina, Dados, Pessoas, Execução, Feedback e Resultado. Pergunta central: "O que realmente mudou nos primeiros 30 dias?" Criar comparação Dia 1 x Dia 30',
  entrega_esperada = 'Comparação Dia 1 x Dia 30 documentada, mais o Plano de Ação do Gestor',
  criterio_sucesso = 'Checkpoint 30 dias realizado com as 6 dimensões avaliadas e pelo menos 1 mudança concreta identificada por gestor',
  proximo_passo = 'Fase 2 — sair da construção da rotina para trabalhar a qualidade da gestão: feedback, 1:1, performance e estratégia'
where numero = 4;

-- Semana 5 — Feedback
update gc_semana set
  objetivo = 'Instalar a prática de feedback estruturado como parte da rotina do gestor',
  tema_central = 'Feedback: Fato → Comportamento → Impacto → Expectativa → Próximo passo',
  reuniao_segunda = 'João apresenta o modelo de feedback e como registrá-lo: situação, feedback, acordo, prazo, acompanhamento',
  exercicio_pratico = 'Cada gestor prepara e aplica pelo menos 1 feedback estruturado com um consultor usando o modelo',
  tarefa_gestores = 'Realizar o feedback estruturado e registrar por escrito: situação, feedback, acordo, prazo, acompanhamento',
  aplicacao_consultores = 'Consultor recebe feedback estruturado, não genérico, com acordo e prazo definidos. Feedback 360: o gestor também pergunta ao consultor o que fez que ajudou, o que espera dele, onde está errando, o que pode melhorar como gestor.',
  o_que_observar = 'Se o feedback seguiu o modelo (fato, não julgamento) e se terminou em acordo e prazo, não só em conversa',
  indicador_sugerido = 'Número de feedbacks estruturados registrados na semana (mínimo 1 por gestor)',
  checkpoint_sexta = 'João pergunta a cada gestor: como foi dar esse feedback? O que você percebeu? O que faria diferente?',
  entrega_esperada = 'Registro escrito de pelo menos 1 feedback estruturado por gestor',
  criterio_sucesso = 'Os 3 gestores aplicaram e registraram o feedback com acordo e prazo definidos',
  proximo_passo = 'Semana 6 — aprofundar o relacionamento individual com 1:1 estruturado'
where numero = 5;

-- Semana 6 — 1:1 + Desenvolvimento
update gc_semana set
  objetivo = 'Criar espaço estruturado de escuta e desenvolvimento individual',
  tema_central = 'Conversa 1:1',
  reuniao_segunda = 'João apresenta o roteiro do 1:1: como você está, o que está funcionando, o que dificulta, onde quer evoluir, o que posso fazer para ajudar, o que precisa melhorar, qual compromisso assumimos',
  exercicio_pratico = 'Cada gestor realiza pelo menos um 1:1 com um consultor usando o roteiro',
  tarefa_gestores = 'Conduzir o 1:1 e construir, junto com o consultor, um plano individual de desenvolvimento',
  aplicacao_consultores = 'Consultor participa do 1:1 e sai com compromisso e plano de desenvolvimento definidos junto ao gestor',
  o_que_observar = 'Se o 1:1 foi uma escuta real ou virou apenas um bate-papo sem compromisso assumido ao final',
  indicador_sugerido = 'Número de 1:1 realizados e número de planos individuais de desenvolvimento criados',
  checkpoint_sexta = 'Gestores compartilham com João o que descobriram nos 1:1 e quais compromissos foram assumidos',
  entrega_esperada = 'Plano individual de desenvolvimento por consultor atendido',
  criterio_sucesso = 'Cada gestor realizou ao menos 1 1:1 com plano de desenvolvimento registrado',
  proximo_passo = 'Semana 7 — usar o que foi aprendido no feedback e no 1:1 para montar a matriz de performance da equipe'
where numero = 6;

-- Semana 7 — Performance
update gc_semana set
  objetivo = 'Dar ao gestor uma visão estruturada de quem precisa de que na equipe',
  tema_central = 'Matriz de performance: Resultado + Produtividade + Comportamento + Evolução',
  reuniao_segunda = 'João apresenta a matriz de acompanhamento nos 4 eixos e como classificar cada consultor nela',
  exercicio_pratico = 'Cada gestor posiciona todos os seus consultores na matriz',
  tarefa_gestores = 'Classificar cada consultor: precisa acelerar, precisa desenvolver, precisa de suporte, ou pronto para maior autonomia',
  aplicacao_consultores = 'Nenhuma comunicação direta obrigatória nesta semana — é um exercício de análise do gestor',
  o_que_observar = 'Se a classificação é baseada em dado (resultado, produtividade) ou em preferência pessoal do gestor',
  indicador_sugerido = 'Matriz de performance completa, com 100% dos consultores classificados',
  checkpoint_sexta = 'João revisa as decisões de classificação com cada gestor, questionando os casos duvidosos',
  entrega_esperada = 'Matriz de performance da equipe, validada por João',
  criterio_sucesso = 'Matriz completa e revisada, com plano de ação (acelerar, desenvolver, suportar ou autonomia) para cada consultor',
  proximo_passo = 'Semana 8 — transformar a leitura de performance em plano comercial e estratégico'
where numero = 7;

-- Semana 8 — Estratégia
update gc_semana set
  objetivo = 'Fazer o gestor pensar estrategicamente, não apenas operacionalmente',
  tema_central = 'Plano comercial: Meta → Gap → Oportunidade → Estratégia → Ação → Responsável → Prazo → KPI',
  reuniao_segunda = 'João apresenta a estrutura do plano comercial simples e pede que cada gestor construa o seu',
  exercicio_pratico = 'Cada gestor constrói seu plano comercial usando a matriz de performance da semana 7 como insumo',
  tarefa_gestores = 'Entregar o plano comercial completo: meta, gap, oportunidade, estratégia, ação, responsável, prazo, KPI',
  aplicacao_consultores = 'Ações do plano comercial são distribuídas e comunicadas aos consultores responsáveis, com prazo',
  o_que_observar = 'Se o plano conecta com o gap real identificado, não é genérico, e se tem responsável e prazo de verdade',
  indicador_sugerido = 'Planos comerciais entregues (3 de 3) com KPI definido',
  checkpoint_sexta = 'Sessão de revisão: João revisa os 3 planos comerciais com os respectivos gestores',
  entrega_esperada = 'Plano comercial validado por gestor, encerrando a Fase 2',
  criterio_sucesso = 'Os 3 planos comerciais aprovados por João, com ações já distribuídas aos consultores',
  proximo_passo = 'Fase 3 — sair de "fazer" para "tornar replicável": mapear processos, avaliar CRM, testar automação e IA, documentar o playbook'
where numero = 8;

-- Semana 9 — Processos
update gc_semana set
  objetivo = 'Identificar o que hoje depende de uma pessoa e não deveria',
  tema_central = 'Mapeamento de processos manuais',
  reuniao_segunda = 'João apresenta a pergunta-guia "o que fazemos hoje que não deveria depender de uma pessoa?" e o método de classificação',
  exercicio_pratico = 'Cada gestor mapeia tarefas, relatórios, distribuição, acompanhamento, comunicação e controles da própria rotina e da equipe',
  tarefa_gestores = 'Classificar cada item mapeado em Manual, Automatizável, Eliminável ou Padronizável',
  aplicacao_consultores = 'Consultores são consultados sobre tarefas manuais repetitivas do dia a dia, alimentando o mapeamento do gestor',
  o_que_observar = 'Se o mapeamento é honesto, incluindo tarefas do próprio gestor, ou só aponta para o time',
  indicador_sugerido = 'Número de processos mapeados e classificados por gestor',
  checkpoint_sexta = 'João consolida os 3 mapeamentos e identifica os processos com maior potencial de automação ou eliminação',
  entrega_esperada = 'Mapa de processos classificado (Manual, Automatizável, Eliminável, Padronizável)',
  criterio_sucesso = 'Mapeamento completo dos 3 gestores, com pelo menos 3 processos priorizados para a Semana 11',
  proximo_passo = 'Semana 10 — avaliar o CRM (atual e o desenvolvido por João) à luz desse mapeamento'
where numero = 9;

-- Semana 10 — CRM
update gc_semana set
  objetivo = 'Entender onde o CRM ajuda e onde atrapalha, sem decidir substituição por antecipação',
  tema_central = 'CRM atual versus CRM desenvolvido por João',
  reuniao_segunda = 'João apresenta os dois sistemas e o critério de avaliação: informações, indicadores, gargalos, automações, usabilidade',
  exercicio_pratico = 'Cada gestor avalia o uso do CRM atual pela própria equipe nos 5 critérios',
  tarefa_gestores = 'Entregar avaliação estruturada do CRM atual — o que funciona e o que não funciona',
  aplicacao_consultores = 'Consultores dão feedback direto de uso do CRM: o que é fácil, o que trava, o que falta',
  o_que_observar = 'Se a avaliação é sobre o sistema em si ou sobre a forma como está sendo usado — são dois problemas diferentes',
  indicador_sugerido = 'Avaliação estruturada entregue pelos 3 gestores, consolidada com o feedback dos consultores',
  checkpoint_sexta = 'João define, junto com os gestores, um pequeno processo prioritário para rodar como piloto no CRM do João',
  entrega_esperada = 'Processo-piloto definido, com escopo claro e mensurável',
  criterio_sucesso = 'Piloto definido com processo, responsável e forma de medir sucesso',
  proximo_passo = 'Semana 11 — usar esse piloto como base para testar automação e IA'
where numero = 10;

-- Semana 11 — Automação + IA
update gc_semana set
  objetivo = 'Sair da teoria da automação para um piloto mensurável de verdade',
  tema_central = 'Automação e IA aplicadas: Relatório manual → Automação → Dashboard → IA → Diagnóstico → Ação',
  reuniao_segunda = 'João apresenta o fluxo completo e como aplicá-lo no piloto definido na Semana 10',
  exercicio_pratico = 'João e o gestor responsável implementam o piloto de automação ou IA no processo escolhido',
  tarefa_gestores = 'Acompanhar o piloto na rotina real durante a semana e registrar o antes e depois',
  aplicacao_consultores = 'Consultores impactados pelo piloto usam a versão automatizada ou assistida por IA no dia a dia e dão feedback',
  o_que_observar = 'Se o piloto de fato economiza tempo e melhora a decisão, ou apenas troca de ferramenta sem ganho real',
  indicador_sugerido = 'Métrica de antes e depois do processo-piloto (tempo gasto, tempo de resposta ou taxa de erro)',
  checkpoint_sexta = 'João e gestores avaliam o resultado do piloto e decidem: expandir, ajustar ou descartar',
  entrega_esperada = 'Piloto mensurável com resultado documentado, antes versus depois',
  criterio_sucesso = 'Piloto rodou a semana inteira com métrica registrada e ganho identificável, mesmo que pequeno',
  proximo_passo = 'Semana 12 — consolidar rotina, dados, feedback, processos, CRM e automação no Playbook TVF'
where numero = 11;

-- Semana 12 — Playbook
update gc_semana set
  objetivo = 'Documentar e consolidar todo o sistema de gestão construído nos 90 dias',
  tema_central = 'Playbook de Gestão TVF',
  reuniao_segunda = 'João apresenta a estrutura do playbook — rotina, rituais, reuniões, indicadores, feedback, 1:1, gestão de oportunidades, planejamento, CRM, automações, boas práticas — e distribui a documentação entre os gestores',
  exercicio_pratico = 'Cada gestor documenta a própria versão validada de cada ritual que rodou nos 90 dias',
  tarefa_gestores = 'Preparar e apresentar: o que mudou, o que aprendeu, o que implementou, o que funcionou, o que não funcionou, qual indicador evoluiu, o que ainda precisa melhorar',
  aplicacao_consultores = 'Consultores são convidados a validar se reconhecem a rotina documentada como a que realmente vivem no dia a dia',
  o_que_observar = 'Se o playbook reflete a prática real, testada por 90 dias, ou é uma reconstrução teórica de última hora',
  indicador_sugerido = 'Número de rituais documentados e validados (meta: 100% dos rituais rodados nos 90 dias)',
  checkpoint_sexta = 'Cada gestor apresenta as 7 perguntas de fechamento para João',
  entrega_esperada = 'Playbook de Gestão TVF v1, documento único e consolidado',
  criterio_sucesso = 'Playbook completo, validado pelos 3 gestores e por João, pronto para o Demo Day',
  proximo_passo = 'Dia 90 — Demo Day: apresentação final Antes → 90 dias → Depois'
where numero = 12;

-- ── Matriz de responsabilidade — ação específica de Tiago, Felipe e Yves, semana a semana ──
-- IDs confirmados em migrations anteriores deste projeto (organograma real).
-- Só roda se a tabela ainda estiver vazia — evita duplicar linha se alguém rodar 2x.
do $$
declare
  tiago_id uuid := '5f621416-210a-4524-9640-66de43111e3a';
  felipe_id uuid := '3290f265-617b-4f5d-884a-254252461165';
  yves_id uuid := 'dddba003-a87c-4511-8047-55ffd30ca46c';
begin
  if not exists (select 1 from gc_matriz_responsabilidade limit 1) then

    insert into gc_matriz_responsabilidade (semana_id, gestor_id, acao_especifica)
    select s.id, x.gestor_id, x.acao
    from gc_semana s
    join (values
      (1, 'Diagnóstico com João: gap de feedback e indicador registrado.'::text, 'Diagnóstico com João: gap de plano de desenvolvimento registrado.'::text, 'Diagnóstico com João: gap de 1:1/cascata registrado.'::text),
      (2, 'Define 1 indicador simples (propostas paradas) e passa a acompanhar toda sexta.', 'Escreve plano de desenvolvimento de 1 consultor (3 linhas) e aplica feedback de 10 min, registrado.', 'Estrutura pauta fixa de 1:1 de 15 min e aplica com 1 consultor piloto.'),
      (3, 'Passa a tirar 3 números do CRM toda sexta (propostas abertas, paradas, conversão).', 'Expande o plano de desenvolvimento pro 2º consultor.', 'Aplica o 1:1 de 15 min com o 2º consultor.'),
      (4, 'Chega na reunião de segunda com os 3 números prontos, sem abrir planilha na hora.', 'Tem plano escrito de pelo menos 2 consultores, feedback aplicado e registrado.', 'Rotina de 1:1 rodando com 2 consultores, pauta fixa sem depender de lembrete.'),
      (5, 'Leva a rotina de números do CRM pra equipe: cada consultor reporta 1 número da semana.', 'Expande o plano de desenvolvimento pra todos os consultores — começa a escrever os 4 planos.', 'Aplica a pauta de 1:1 de 15 min com os 4 consultores da equipe, registra em planilha.'),
      (6, 'Identifica com dado (não achismo) 1 consultor com mais propostas paradas; ação direcionada.', 'Tem plano escrito de pelo menos 2 consultores da equipe completa.', 'Consultores já citam a própria meta da semana sem Yves lembrar.'),
      (7, 'Consultores da equipe passam a trazer o próprio número no início do 1:1, sem Tiago pedir.', 'Tem os 4 planos escritos e aplicados; feedback quinzenal rodando.', 'Revisa a cascata: identifica consultor que ainda não assumiu a rotina e ajusta.'),
      (8, 'Decisões da equipe orientadas por dado do CRM; revisão de sexta virou hábito sem lembrete.', '4 planos de desenvolvimento ativos, evolução registrada e visível.', 'Todos os consultores sabem a própria meta sem o gestor lembrar.'),
      (9, 'Avaliação formal com João: gaps da Semana 1 revisados — feedback e indicador fechados.', 'Avaliação formal: plano de desenvolvimento virou rotina, não exceção.', 'Avaliação formal: cascata de 1:1 consolidada com toda a equipe.'),
      (10, 'Escreve 1 página: como mantém a rotina de CRM sem João cobrando (dia fixo, alerta de queda).', 'Escreve 1 página: como mantém o ciclo de planos de desenvolvimento sozinho.', 'Escreve 1 página: como mantém a cascata de 1:1 sem supervisão direta.'),
      (11, 'Escreve 1 página: como mantém a rotina de CRM sem João cobrando (dia fixo, alerta de queda).', 'Escreve 1 página: como mantém o ciclo de planos de desenvolvimento sozinho.', 'Escreve 1 página: como mantém a cascata de 1:1 sem supervisão direta.'),
      (12, 'Testa conduzir a reunião de segunda sozinho, playbook na mão.', 'Testa conduzir 1:1 de desenvolvimento sozinho, sem João no processo.', 'Testa conduzir o checkpoint de sexta com a equipe sozinho.')
    ) as m(numero, acao_tiago, acao_felipe, acao_yves) on s.numero = m.numero
    cross join lateral (values (tiago_id, m.acao_tiago), (felipe_id, m.acao_felipe), (yves_id, m.acao_yves)) as x(gestor_id, acao);

  end if;
end $$;
