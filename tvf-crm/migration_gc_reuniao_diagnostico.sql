-- Amplia a constraint de gc_reuniao.tipo pra aceitar 'diagnostico' (card de autodiagnóstico
-- individual, agora com aba própria em vez de ficar dentro de Reuniões). Idempotente — se já
-- rodou via chat antes, roda de novo sem erro.

alter table gc_reuniao drop constraint if exists gc_reuniao_tipo_check;
alter table gc_reuniao add constraint gc_reuniao_tipo_check check (tipo in ('segunda', 'sexta', 'diagnostico'));
