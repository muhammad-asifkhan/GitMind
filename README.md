---
title: GitMind Backend
emoji: 🧠
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 8001
pinned: false
license: mit
---

<!-- HF Spaces reads the YAML frontmatter above. GitHub hides it when rendering. -->

# GitMind — Crisis Room

[![CI](https://github.com/muhammad-asifkhan/GitMind/actions/workflows/ci.yml/badge.svg)](https://github.com/muhammad-asifkhan/GitMind/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org)
[![React 19](https://img.shields.io/badge/react-19-blue.svg)](https://react.dev)

Multi-agent repo intelligence system. Paste a GitHub URL → 4 agents run in parallel → architecture diagram, API docs, security findings, chat-with-the-repo. Optional Crisis Room: live CEO/Legal/Engineering role-play vs a Reporter on a 45-second timer, with Engineering grounded in the actual offending source via RAG.

Stack: FastAPI · LangGraph · OpenAI GPT-4o-mini · ChromaDB · React · Mermaid · semgrep

## Screenshots

**Architecture** — file tree converted to a Mermaid diagram in one LLM call.
![Architecture tab](https://github.com/muhammad-asifkhan/GitMind/raw/main/docs/1-architecture.png)

**API Docs** — every endpoint extracted with regex pre-filter + LLM, deduped across files.
![API Docs tab](https://github.com/muhammad-asifkhan/GitMind/raw/main/docs/2-api-docs.png)

**Security** — semgrep scan + LLM exec-summary triage. High/Critical findings get an "Open Crisis Room" button.
![Security tab](https://github.com/muhammad-asifkhan/GitMind/raw/main/docs/3-security.png)

**Crisis Room** — CEO/Legal/Engineering role-play live over WebSocket. Engineering pulls the offending file from the RAG store before responding.
![Crisis Room](https://github.com/muhammad-asifkhan/GitMind/raw/main/docs/4-crisis-room.png)

**Chat** — ChromaDB-backed RAG over the embedded codebase, cites the files it pulled from.
![Chat tab](https://github.com/muhammad-asifkhan/GitMind/raw/main/docs/5-chat.png)

## Project layout

```
IM-Hackathon/
├── backend/                 ← FastAPI + LangGraph
│   ├── main.py              ← /ws/analyze, /ws/crisis, /chat, /health
│   ├── orchestrator.py      ← analysis + crisis graphs
│   ├── state.py             ← shared RepoState (Annotated reducers)
│   ├── chroma_utils.py
│   ├── llm_cache.py
│   ├── smoke_test.py        ← run before demo (must show 9/9 PASS)
│   ├── requirements.txt     ← pinned dependency list
│   ├── .env.example         ← copy to .env, add OPENAI_API_KEY
│   └── agents/
│       ├── scanner.py
│       ├── architecture.py
│       ├── api_doc.py
│       ├── security.py
│       ├── rag_setup.py
│       ├── chat.py
│       └── crisis/          ← stretch: CEO/Legal/Engineer/Reporter
│           ├── _base.py
│           ├── router.py
│           ├── ceo.py
│           ├── legal.py
│           ├── engineer.py
│           └── reporter.py
├── frontend/                ← React app
│   ├── package.json
│   ├── public/
│   └── src/
│       ├── App.js
│       ├── api.js
│       └── components/
│           ├── AgentProgress.jsx
│           ├── DiagramTab.jsx
│           ├── DocsTab.jsx
│           ├── SecurityTab.jsx
│           ├── ChatTab.jsx
│           └── CrisisChat.jsx
├── start.sh                 ← Linux/macOS launcher
└── start.bat                ← Windows launcher
```

## Quickstart

1. Add OpenAI key:
   ```bash
   cp backend/.env.example backend/.env
   # edit backend/.env → OPENAI_API_KEY=sk-...
   ```

2. Run:
   ```bash
   ./start.sh           # Linux / macOS
   start.bat            # Windows
   ```

3. Open http://localhost:3000 — paste a GitHub URL, click **⚡ Analyze**.

## Manual setup

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload                # http://127.0.0.1:8001
```

### Frontend
```bash
cd frontend
npm install
npm start                                  # http://localhost:3000
```

## Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/ws/analyze` | WS | streams agent_status, architecture_diagram, api_docs, security_findings, chroma_collection_name |
| `/chat` | POST | `{session_id, question}` → `{answer}` (RAG) |
| `/ws/crisis` | WS | `{session_id, finding_id}` → streams CEO/Legal/Engineering messages, optional Reporter leak |
| `/health` | GET | `{status, sessions_active}` |

## Smoke test

```bash
cd backend && source venv/bin/activate && python smoke_test.py
```

Must show **9/9 PASS** before demo. For CI environments without an OpenAI key or network, run with `--ci` (or `SMOKE_CI=1`) to skip the live-network checks.

## Deploy (free tier)

GitMind is split-deploy: frontend on Vercel, backend wherever Docker runs. Both have free tiers that cover demo usage.

### 1 — Backend (any Docker host)

A production-ready [`Dockerfile`](Dockerfile) is at the repo root. It bundles `git`, `semgrep`, and pinned Python deps.

**Hugging Face Spaces (free, persistent):**
1. Create a new Space → SDK: **Docker** → from your forked repo
2. In the Space's **Settings → Secrets**, add `OPENAI_API_KEY`
3. Add a Space variable `CORS_ORIGINS` set to your Vercel URL (e.g. `https://gitmind.vercel.app`)
4. The Space will auto-build and serve on a public URL

**Google Cloud Run (free tier: 2M requests/month):**
```bash
gcloud run deploy gitmind-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars OPENAI_API_KEY=sk-...,CORS_ORIGINS=https://gitmind.vercel.app
```

**Local Docker (smoke check):**
```bash
docker build -t gitmind-backend .
docker run -p 8001:8001 -e OPENAI_API_KEY=sk-... gitmind-backend
```

### 2 — Frontend (Vercel)

1. [vercel.com/new](https://vercel.com/new) → import this repo
2. **Root directory:** `frontend`
3. **Framework preset:** Create React App (auto-detected via [`frontend/vercel.json`](frontend/vercel.json))
4. **Environment variable:** `REACT_APP_API_BASE` = your backend URL (e.g. `https://your-space.hf.space`)
5. Deploy

The frontend's [`api.js`](frontend/src/api.js) auto-derives the WebSocket base from the same env var, so analysis + crisis room work without further config.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and PR to `main`:
- Backend: smoke test (CI mode) + import-graph compile check on Python 3.11 and 3.12
- Frontend: `npm test` + `npm run build` on Node 20

Green badge above means main is in a deployable state.
