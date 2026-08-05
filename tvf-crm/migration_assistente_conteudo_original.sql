-- Guarda o PDF/arquivo original permanentemente ligado ao tema, pra dar pra "ver o documento
-- de verdade" (evidência visual) em vez de confiar só no texto extraído. Reaproveita o bucket
-- que já existe (assistente-uploads), só que agora sem apagar depois de processado.

alter table assistente_conteudo add column if not exists arquivo_original_path text;
alter table assistente_conteudo add column if not exists arquivo_original_nome text;
