-- Aba "Minha Comissão" — visão pessoal e intransferível do João, separada do Plano
-- Comercial (que é visão de time). Avançado e Outras Receitas não existem como pilar
-- próprio no Plano Comercial hoje (ficam somados dentro de RECEITA_TELECOM), então essa
-- tabela guarda os 6 pilares do plano de remuneração com meta, gatilho (métrica que decide
-- a faixa — quantidade pra Altas/BL/Renovação Móvel, R$ pros demais) e receita (R$ que a
-- comissão realmente multiplica) separados.

create table if not exists comissao_pilar (
  id uuid primary key default gen_random_uuid(),
  mes_referencia date not null,
  pilar text not null check (pilar in ('ALTAS','BANDA_LARGA','RENOVACAO_MOVEL','AVANCADO','OUTRAS_RECEITAS','APARELHO')),
  meta_gatilho numeric not null default 0,
  gatilho numeric not null default 0,
  receita numeric not null default 0,
  atualizado_em timestamptz default now(),
  unique (mes_referencia, pilar)
);

alter table comissao_pilar enable row level security;

-- travado no ID do João mesmo, sem regra genérica de "todo Gestor vê a própria comissão" —
-- pedido explícito: "isso é incontestável que seja só pra minha visão".
create policy "so_joao_ve_comissao" on comissao_pilar
  for select using (auth.uid() = '971645c3-b9a3-44a9-9848-5a5fa83ff8b1');

create policy "so_joao_edita_comissao" on comissao_pilar
  for all using (auth.uid() = '971645c3-b9a3-44a9-9848-5a5fa83ff8b1')
  with check (auth.uid() = '971645c3-b9a3-44a9-9848-5a5fa83ff8b1');
