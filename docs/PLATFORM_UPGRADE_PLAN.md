# AllModelAI Platform Upgrade — Code-Based Implementation Plan

**Stack preserved:** React + Vite (JS), Node/Express, Python/FastAPI, Supabase Postgres, Firebase auth, existing providers, Vercel + Render.

**Visual:** Black / violet / purple identity; no TypeScript migration.

This plan maps each requested feature to **what already exists** in the repo and what must be **built or extended**.

---

## Phase 1 — Audit & stability (baseline)

| Area | Current state | Gap / action |
|------|----------------|--------------|
| **Supabase egress** | Postgres via `DATABASE_URL`; no Supabase JS client in frontend. Prior work: analytics SQL aggregates, chat history summaries + limits, deduped frontend fetches, Production Center poll interval, `pgTrafficDiagnostics`. | **Verify** Supabase dashboard after deploy; add admin egress **estimates** (not a substitute for Supabase metrics). Continue pagination on hot reads. |
| **Auth** | Firebase + email/password, session cookies, `SessionProvider`, extensive backend tests. | Regression suite expansion (Phase 5). |
| **Smart Router** | `smartRouter2/`, fallbacks, telemetry, access control. | Smart Router 3.0 scoring/circuit breakers (Phase 4). |
| **Knowledge / RAG** | `knowledgeBaseController`, `rag/knowledgeBaseService`, `/knowledge/*`, collections under `/intelligence/knowledge/*`. | UI polish, chunk pipeline audit, reindex UX (Phase 4). |
| **Memory** | `/ai/memory/*`, Zilliz optional store, workspace memory items. | Memory 2.0 dashboard + dedup (Phase 4). |
| **Code assistant** | `codeAssistant.js`, `/api/code/assist`, `ChatCodeBlock` actions. | Dedicated **AI Code Reviewer** page + languages (Phase 4). |
| **Command palette** | `CommandPalette.jsx` — Ctrl/Cmd+K, basic filter, no fuzzy/arrow nav. | Extend commands + a11y (Phase 3). |
| **Chat workspace** | Large `Chat.jsx`, premium CSS partial (`allmodelai-3-workspace.css`). | Workspace 2.0 visual pass (Phase 3). |
| **Composer** | Voice, attachments, streaming, regenerate patterns in Chat. | Unified composer component + dedupe sends (Phase 3). |
| **Monitoring** | `requestTelemetry` → `operationalMetrics`, `Admin.jsx` ops tab, `pgTrafficDiagnostics`, provider health. | **Feature 1** extended metrics + admin API Performance tab (Phase 2 — in progress). |
| **Cache** | Redis/in-memory `cache.js`, public route cache, chat history client dedupe. | **Feature 3** user-scoped safe cache + server dedupe (Phase 2). |
| **Rate limits** | IP + user limits in `apiRateLimit.js`. | **Feature 4** free/premium tiers + admin stats (Phase 2). |
| **E2E** | Playwright: session, responsive, sidebar, video. | **Feature 22** broaden coverage (Phase 5). |
| **Load tests** | None dedicated. | **Feature 24** isolated staging scripts only (Phase 5). |

**Phase 1 exit criteria:** Baseline tests green (`backend npm test`, frontend unit tests, existing e2e); egress hotspots documented; no production deploy.

---

## Phase 2 — Backend (Features 1, 3, 4)

### Feature 1 — API Performance Monitor
- **Extend** `operationalMetrics.js`: status buckets (200/400/401/402/429/500), RPM series, payload size when `Content-Length` present, failing routes.
- **Extend** `requestTelemetry.js` to record bytes.
- **New** `GET /api/admin/ops/api-performance` (requireAdmin): merges HTTP metrics, Postgres query diagnostics, AI/training health snapshot, rate-limit stats.
- **Admin UI** tab: charts (latency, RPM, errors, top routes, DB egress estimate).

### Feature 3 — Smart API Cache
- **New** `smartApiCache.js`: in-flight dedupe keys, user-scoped GET cache (email hash prefix), TTL from env.
- Wire into safe read endpoints incrementally (analytics, model status public cache already exists).
- **Do not** cache authenticated chat bodies cross-user.

### Feature 4 — API Rate Limiter
- **Extend** `createUserRateLimitMiddleware`: `USER_RATE_LIMIT_PREMIUM_PER_MIN`, plan detection via lightweight subscription read.
- **Track** rate-limit events for admin stats.
- Return **429** + `Retry-After` (already present).

---

## Phase 3 — Frontend (Features 5, 7, 8)

### Feature 5 — AI Workspace 2.0
- Consolidate layout tokens in workspace CSS; glass panels; model cards; sidebar groups; `prefers-reduced-motion`.

### Feature 7 — Advanced Chat Composer
- Extract `ChatComposer.jsx` from Chat; auto-resize; drag-drop; stop/regenerate; duplicate-submit guard.

### Feature 8 — Command Palette
- Fuzzy match (fuse-lite or simple score); arrow-key selection; commands: new chat, search history, model switch, settings, knowledge, code reviewer, billing.

---

## Phase 4 — AI Engineering (Features 10, 14, 15, 16)

### Feature 10 — Knowledge Base
- Harden upload limits; ensure chunk + embedding path uses existing vector store; source citations in chat (partially present via `knowledgeSources`).

### Feature 14 — Smart Router 3.0
- Extend `smartRouter2/routerPolicy.js`: latency/cost weights, circuit breaker state from `providerRequestTelemetry`, max fallback depth.

### Feature 15 — Code Reviewer
- New route `/code-reviewer` + API wrapper over `/api/code/assist` with review modes and diff UI.

### Feature 16 — Memory 2.0
- Memory dashboard page; TTL for temp; dedup on write; reuse `/ai/memory` APIs.

---

## Phase 5 — QA (Features 22, 23, 24)

### Feature 22 — Playwright cross-device
- Add specs: login email, chat send mock, history, attachment mock, subscription gate; projects: chromium, firefox, webkit + mobile viewports.

### Feature 23 — AI regression
- Router unit tests (mock fetch); 402/429/timeout; memory isolation; knowledge retrieval mocks.

### Feature 24 — Load & stress
- `backend/scripts/load-staging.mjs` — configurable base URL, concurrency 10/50/100, **local/staging only** guard env.

---

## Phase 6 — Integration
- Full CI run; manual admin verification; egress check; update API docs (`docs/API.md` or README section); env var names only.

---

## Environment variables (names only — set in Render/Vercel/backend `.env`)

| Variable | Purpose |
|----------|---------|
| `ENABLE_DB_TRAFFIC_DIAGNOSTICS` | Postgres query byte estimates |
| `CHAT_HISTORY_LIST_LIMIT` / `CHAT_HISTORY_LIST_MAX` | History pagination |
| `API_RATE_LIMIT_*` / `USER_RATE_LIMIT_*` / `USER_RATE_LIMIT_PREMIUM_PER_MIN` | Rate limits |
| `ENABLE_API_RATE_LIMIT` / `ENABLE_USER_RATE_LIMIT` | Toggle limits |
| `SMART_CACHE_TTL_SEC` / `SMART_CACHE_MAX_ENTRIES` | Safe API cache |
| `ADMIN_KEY` | Admin dashboards |
| `REDIS_URL` | Shared rate limit + cache (optional) |
| `AI_PYTHON_BASE_URL` | AI service health probe |

---

## Modified files (Phase 2 start)

See git diff for: `operationalMetrics.js`, `requestTelemetry.js`, `apiRateLimit.js`, `smartApiCache.js`, `opsCenter.js`, `routes.js`, `Admin.jsx`, tests.

**No production deploy or main push without explicit approval.**
