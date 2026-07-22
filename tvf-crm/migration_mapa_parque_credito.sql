-- Adiciona os campos reais de crédito (Valor de Carteira Móvel/Fixa) do export InfoB2B.
-- São números diretos (ex: 686.75), muito mais confiáveis que tentar somar "R$ x.xxx,xx" de campos de texto.

alter table mapa_parque_import
  add column if not exists vl_car_movel numeric(12,2) default 0,
  add column if not exists vl_car_fixa numeric(12,2) default 0;
