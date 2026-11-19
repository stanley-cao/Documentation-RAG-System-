# Margin

Chat with your own documents. Upload text or Markdown files, ask questions in plain language, and get answers grounded in the passages that were retrieved, with the source file named.

## Features

- **Threaded chat** with streamed (SSE) answers rendered as Markdown
- **Agentic retrieval:** the model decides when to call a `search_documents` tool, over up to 3 search rounds per answer
- **Hybrid search:** pgvector cosine similarity + Postgres full-text keyword search, fused with Reciprocal Rank Fusion. Exact-keyword lookups return only the matching lines, to save tokens.
- **Document ingestion:** drag-and-drop `.txt` / `.md` (up to 10 MB), chunked, embedded and stored, with live status via Supabase Realtime
- **Multi-user:** Supabase Auth, row-level security on every table, admin role
- **Admin settings:** any OpenAI-compatible LLM and embedding endpoint, similarity threshold and max results; API keys encrypted at rest (Fernet)
- **Editorial UI** with light/dark themes and a mobile layout

## Stack

| Layer | Tech |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind |
| Backend | Python, FastAPI |
| Data | Supabase (Postgres + pgvector, Auth, Storage, Realtime) |
| LLM | Any OpenAI-compatible API (tested with Groq and Google Gemini) |
| Embeddings | Any OpenAI-compatible API or local Ollama (`nomic-embed-text`) |

## Project layout

```
backend/            FastAPI app (routers, services, Supabase client)
frontend/           React app
supabase/           SQL migrations + config (apply with `supabase db push`)
scripts/            start-all.sh / start-backend.sh / start-frontend.sh
```

## Setup

1. **Supabase:** create a project, then link it and apply the migrations:
   ```bash
   supabase link --project-ref <your-ref>
   supabase db push
   ```
2. **Backend:**
   ```bash
   cd backend
   python3 -m venv venv
   venv/bin/pip install -r requirements.txt
   cp .env.example .env   # fill in the Supabase keys and SETTINGS_ENCRYPTION_KEY
   ```
   Generate an encryption key with:
   `venv/bin/python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
3. **Frontend:**
   ```bash
   cd frontend
   npm install
   cp .env.example .env   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
   ```
4. **Embeddings (optional, local):** install [Ollama](https://ollama.com), then run `ollama pull nomic-embed-text`.

## Run

```bash
./scripts/start-all.sh      # backend on :8000, frontend on :5173 (Ctrl+C stops both)
```

Then open http://localhost:5173 and sign up. To make yourself an admin, run this in the Supabase SQL editor:

```sql
UPDATE user_profiles SET is_admin = true
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'you@example.com');
```

As an admin, open **Settings** from the user menu and enter the LLM and embedding model, base URL and API key. Embedding settings lock once documents are indexed.
