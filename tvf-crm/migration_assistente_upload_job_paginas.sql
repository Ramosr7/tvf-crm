-- Processamento de PDF grande passa a ser em fatias de poucas páginas por vez (em vez do
-- documento inteiro numa chamada só) — reduz timeout e recusa da IA em decks grandes/pesados
-- de imagem. Cada chamada processa uma fatia e salva o progresso; dá pra retomar de onde parou.

alter table assistente_upload_job add column if not exists total_paginas integer;
alter table assistente_upload_job add column if not exists paginas_processadas integer not null default 0;
