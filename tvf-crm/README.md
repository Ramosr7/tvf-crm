# TVF CRM

Mini CRM Kanban para gestão de leads do Tallis (Banda Larga e Aparelho).

## Funcionalidades

- 3 abas: Novos leads / Recontatos / Fechados
- Kanban com 4 colunas (Aguardando → Em contato → Proposta enviada → Sem resposta)
- Mover card entre colunas
- Marcar lead como fechado
- Adicionar observações
- Abrir WhatsApp direto do card
- Filtro por campanha (Banda Larga / Aparelho)
- Atualização em tempo real via Supabase Realtime

## Setup

### 1. Variáveis de ambiente

Copie o arquivo `.env.example` para `.env.local` e preencha:

```
REACT_APP_SUPABASE_URL=https://vbabkfqxtydswdczbmun.supabase.co
REACT_APP_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

A anon key está em: Supabase → Settings → API → anon public

### 2. Adicionar colunas no Supabase

Execute no SQL Editor do Supabase:

```sql
ALTER TABLE consultores
  ADD COLUMN IF NOT EXISTS status_crm TEXT DEFAULT 'Aguardando',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS operadora_atual TEXT,
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS numero_imovel TEXT;
```

### 3. Deploy no Vercel

1. Suba o projeto para um repositório GitHub
2. Acesse vercel.com → New Project → importe o repo
3. Em Environment Variables, adicione as duas variáveis do .env
4. Clique Deploy

Pronto — o CRM estará online em um link público do Vercel.

## Estrutura

```
src/
  App.js          — componente principal com toda a lógica
  index.css       — estilos
  supabaseClient.js — conexão com Supabase
  index.js        — entry point
public/
  index.html
```
