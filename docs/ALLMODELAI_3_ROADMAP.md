# AllModelAI 3.0 — Architecture & Roadmap

Last updated: 2026-10-27 (Phase 1 kickoff)

## Repository layout

| Area | Path | Role |
|------|------|------|
| Frontend | `frontend/` | React 19 + Vite, PWA, Capacitor/Electron shells |
| API | `backend/` | Express, Postgres/SQLite, auth, chat, billing, teams |
| AI services | `backend/src/services/*`, `ai_python/` | Provider adapters, PyTorch lab, optional FastAPI bridge |
| Auth | Firebase (client) + Express sessions (cookie) + optional Firebase Admin token verify |
| Payments | WayForPay (primary when configured), Stripe, Paddle, Creem stubs | **PayPro Global: not in repo yet** |
| Vector / RAG | `backend/src/services/rag/*`, Zilliz in `backend/src/services/zilliz/*` | Knowledge base + optional Milvus |
| CI | `.github/workflows/ci.yml` | Backend tests, frontend tests, build, Python pytest |

## Already implemented (do not rewrite)

- **Chat**: persistence, SSE streaming, pins, rename, regenerate, copy, attachments, model switch, collapsible sidebar (`Chat.jsx`, `ChatSidebar.jsx`).
- **Auth**: Google OAuth, email/password backend login, password enrollment, forgot-password tokens, session provider.
- **Credits / plans**: `backend/src/billing/*`, subscription + AI credits, model entitlements.
- **WayForPay**: signed checkout, callback verification, idempotent fulfillment, test mode.
- **Teams**: CRUD + roles (`postgresHttpTeams`, routes in `controllers.js`).
- **Knowledge / RAG**: upload, chunk, search, citations in chat stream.
- **Smart routing**: `anoninService`, provider health, fallbacks in chat pipeline.
- **Dashboard**: `/api/analytics`, `/api/subscription`, model library, order history.
- **Design tokens**: `frontend/src/styles/design-system.css`, dark violet dashboard/chat CSS.

## Gaps vs 3.0 spec

| Feature | Status |
|---------|--------|
| PayPro Global billing | **Missing** — merchant in progress; keep sandbox |
| UI 3.0 polish (glass, motion, overflow) | **Partial** — Phase 1 in progress |
| Chat conversation tabs | **Missing** |
| Message edit | **Partial / limited** |
| PayPro vs WayForPay product messaging | Align when PayPro lands |
| Real-time notifications (SSE/WS) | **Partial** (job polling exists) |
| Admin observability dashboard | **Partial** (`ProviderHealth`, ops routes) |
| Gateway 2.0 as single module | **Partial** — logic spread across `chatProviderRuntime`, controllers |

## Phase plan & file touch map

### Phase 1 — Frontend (current)

- `frontend/src/styles/allmodelai-3-workspace.css` — workspace shell, glass, composer, overflow, a11y motion.
- `frontend/src/main.jsx` — import 3.0 layer.
- `frontend/src/components/Dashboard/DashboardUsageChart.jsx` — real `byModel` bars.
- `frontend/src/components/Dashboard/Dashboard.jsx` + `DashboardPremium.css` — spend + chart wiring.
- Tests: `frontend/tests/allmodelai-3-workspace.test.mjs`.

### Phase 2 — Backend gateway & auth hardening

- `backend/src/chatProviderRuntime.js`, new `backend/src/gateway/*` (incremental extract).
- PayPro: `backend/src/paypro/*`, routes, webhook idempotency (mirror WayForPay patterns).
- Auth: continue fixes in `controllers.js`, `socialAuth.js`, `accountPassword.js`.

### Phase 3 — Credits, teams, notifications

- Atomic credit reservation (extend existing credit middleware).
- Team RBAC audit on chat/workspace routes.
- `backend/src/notifications/*` + SSE endpoint.

### Phase 4 — Testing & observability

- Extend CI job matrices; Playwright smoke for auth + checkout test mode.
- Structured logging (`backend/src/logging/*`).

### Phase 5 — AI (router 3.0, RAG, multimodal)

- Router scoring module; circuit breakers on `providerHealth.js`.
- RAG: tighten citation requirements in stream metadata.
- `ai_python/` multimodal endpoints behind capability flags.

## External approvals required

- PayPro merchant + webhook URL on Render.
- WayForPay live: `WAYFORPAY_LIVE_CONFIRM`, merchant approval.
- Firebase: authorized domains, Email/Password provider for linked accounts.
- Zilliz cluster credentials for production RAG scale.

## Phase 1 exit criteria

- No horizontal overflow on chat/dashboard at 320px–2560px widths.
- Dashboard shows backend `estimatedCost` and model usage chart from `/api/analytics`.
- Existing chats and auth flows unchanged; frontend + targeted tests green.
