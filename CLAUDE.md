# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

Repo root has no build config — the app lives in the `tvf-crm/` subdirectory. Run all commands from `tvf-crm/`, not the repo root.

## Commands

```
cd tvf-crm
npm start    # dev server (CRA), http://localhost:3000
npm run build  # production build
```

No test suite, no linter config beyond CRA defaults. No `npm test` script defined.

## What this is

Mini CRM Kanban (Portuguese UI) for TVF Telecom, a Vivo Empresas partner, to manage leads ("consultores" table) captured by a WhatsApp bot named Tallis. Single-page React app, no router.

## Architecture

Everything lives in [tvf-crm/src/App.js](tvf-crm/src/App.js) — one file, no component directory. Structure top to bottom:
- Constants/helpers (score calc, tag classes, date formatting, `wa.me` link builder)
- `LeadModal` — lead detail/edit modal with 3 tabs (Dados / Interações / WhatsApp histórico)
- `LeadCard`, `Coluna` — kanban card and column (drag-and-drop via native HTML5 DnD, no library)
- `App` — root: fetches leads, renders 3 top-level tabs (Novos leads / Recontatos / Fechados)

Data layer is [tvf-crm/src/supabaseClient.js](tvf-crm/src/supabaseClient.js) — a single Supabase client reading `REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_ANON_KEY` from env. All reads/writes go straight through `supabase.from(...)` calls inline in `App.js` — no API layer, no state management library (plain `useState`/`useEffect`/`useCallback`).

### Supabase tables

- `consultores` — the leads table. Key columns: `chat_id` (phone), `nome`, `campanha` (`banda_larga`/`aparelho`/`movel`/`avancado`), `status` (`ativo`/`fechado`), `status_crm` (kanban column name), `etapa_followup` (int — drives Novos vs Recontatos split, see below), `operadora_atual`, `cep`, `numero_imovel`, `observacoes`, `ultimo_contato`, `created_at`.
- `interacoes` — manual interaction log per lead (`consultor_id`, `tipo`, `descricao`, `created_at`).
- `n8n_chat_histories` — WhatsApp conversation log written by the external n8n/Tallis bot, joined by `session_id` = `consultores.chat_id`. Read-only from this app; message content is JSON-encoded (see `parseMensagem` in App.js).

### Lead segmentation logic (in `App`)

- Fechados: `status === 'fechado'`
- Recontatos: `status !== 'fechado' && etapa_followup > 2`
- Novos: `status !== 'fechado' && etapa_followup <= 2`

Only "Novos" gets the kanban board; Recontatos/Fechados render as flat lists.

### Kanban columns

Column names are user-renamable and persisted to `localStorage` (`tvf_colunas`) per-browser, defaulting to `COLUNAS_DEFAULT`. Renaming a column also bulk-updates every lead's `status_crm` in Supabase to the new name — the column set is not stored server-side as its own entity, it's derived from whatever `status_crm` values exist.

Realtime updates: a Supabase Realtime channel subscription on `consultores` (`postgres_changes`, all events) triggers a full refetch — no fine-grained cache updates.

## Deploy

Vercel, using `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` as env vars. See [tvf-crm/README.md](tvf-crm/README.md) for the Supabase schema migration (`ALTER TABLE consultores ADD COLUMN ...`) required before first deploy.
