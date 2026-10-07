# AllModelAI — AI Engineering Systems

This document describes how **Smart Router 2.0**, **RAG Knowledge Base**, **Multi-Agent Research**, and **AI Training Lab** fit together in AllModelAI.

## Architecture overview

```
React (Chat, /knowledge, /ai-training)
        ↓  HTTPS + auth session
Node/Express (routes.js)
        ├─ smartRouter2/     → task classification + provider selection + telemetry
        ├─ rag/              → chunking, embeddings, retrieval, grounded Q&A
        ├─ multiAgent/       → planner → research → verify → writer (SSE progress)
        └─ aiTrainingLabBridge → FastAPI / CLI labs (PyTorch)
        ↓
SQLite (local) or PostgreSQL (migrations/002_ai_engineering.sql)
```

Chat continues to stream through `POST /api/chat`. Smart Router enriches the first SSE metadata event with `router`, `routeTaskType`, and `knowledgeSources`.

## Smart Router 2.0

**Location:** `backend/src/services/smartRouter2/`

- **classifyTask.js** — task type (coding, research, greeting, …) and flags for knowledge / multi-agent.
- **capabilities.js** — registry of model slugs (`gpt`, `claude`, `gemini`, …) with capability flags from project configuration.
- **index.js** — `selectSmartRoute()` returns `{ model, reason, taskType, fallbacks, displayName }`.
- **telemetry.js** — writes anonymized rows to `router_metrics` (no API keys).

Fallback at runtime still uses existing `chatProviderRuntime.findRoutedModelWithApiKey()` and chat stream equivalence fallbacks.

**Preview:** `POST /api/router/preview`

## RAG + Knowledge Base

**Location:** `backend/src/services/rag/`

1. User uploads text (PDF text extracted in the browser via `readDocument.js`).
2. `POST /api/knowledge/documents` chunks text (`KB_CHUNK_SIZE`, `KB_CHUNK_OVERLAP`).
3. **EmbeddingProvider** — local hash vectors by default; set `KB_USE_OPENAI_EMBEDDINGS=true` and `OPENAI_API_KEY` for OpenAI embeddings.
4. `POST /api/knowledge/query` retrieves top-K chunks and synthesizes an answer with citations.

**Tables:** `knowledge_documents`, `knowledge_chunks` (per-user `email`).

Chat: enable **Use Knowledge Base** in the composer; `useKnowledge` is sent to `/api/chat`.

Legacy workspace documents (`workspace_items` type `document`) still work via keyword scoring when no vector chunks exist.

## Multi-Agent Research

**Location:** `backend/src/services/multiAgent/orchestrator.js`

Agents (public progress only): Planner → Research (KB + optional web) → Reasoning/Coding → Verifier → Writer.

**Endpoints:**

- `POST /api/agents/research` — SSE with `agentProgress` events.
- `POST /api/research/answer` with `{ multiAgent: true }` delegates to the same pipeline.

Simple greetings skip multi-agent and fall back to standard deep research or a short message.

Limits: `MULTI_AGENT_MAX_STEPS`, OpenRouter for writer JSON steps.

## AI Training Lab

**Location:** `ai_python/lessons/catalog.py` (15-lesson path), Node ` /api/ai-training/*`, interactive labs for linear regression, gradient descent, PyTorch.

Training runs only through validated lab endpoints — no arbitrary Python from the browser.

## Unified response shape

`backend/src/services/unifiedAiResponse.js` — `buildUnifiedResponse()` used by `/api/knowledge/query`.

Chat SSE adds `router`, `knowledgeSources`, and optional `agentProgress`.

## Adding a provider

1. Add slug to `MODEL_CAPABILITIES` in `capabilities.js`.
2. Ensure `providerModels` in `controllers.js` and env keys in `chatProviderRuntime.js`.
3. Update `SMART_ROUTE_FALLBACK_ORDER` in `providerHealth.js` if needed.

## Adding a training lesson

1. Add metadata to `ai_python/lessons/catalog.py`.
2. If interactive, wire a lab in `ai_python/api/routes.py` and `aiTrainingController.js`.

## Adding an agent

1. Extend `AGENT_ORDER` and orchestrator steps in `multiAgent/orchestrator.js`.
2. Emit only `{ agent, status, summary }` to the client — no chain-of-thought.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `KB_CHUNK_SIZE`, `KB_CHUNK_OVERLAP`, `KB_TOP_K` | RAG tuning |
| `KB_USE_OPENAI_EMBEDDINGS` | Use OpenAI embeddings when `true` |
| `KB_EMBEDDING_MODEL` | OpenAI embedding model id |
| `MULTI_AGENT_MAX_STEPS` | Agent step cap |
| `GEMINI_API_KEY`, `ALLMODELAI_OPENROUTER_API_KEY` | Chat + research |
| `TAVILY_API_KEY` | Web research (optional) |

## Security

- Knowledge routes require auth (`requireAuth`).
- Uploads: size limits, MIME allow-list, sanitized filenames, per-user storage under `backend/storage/knowledge/`.
- No provider keys in the frontend.
