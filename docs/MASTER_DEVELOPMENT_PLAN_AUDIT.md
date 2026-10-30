# AllModelAI — Master Development Plan (Phase 0 Audit)

**Audit date:** 2026-10-30  
**Production:** https://all-model-ai.com · **Local:** http://localhost:5173  

Legend: ✅ Implemented · 🟡 Partial · ❌ Not implemented · ⛔ Blocked / config required

---

## PART 1 — Six new AI engineering features

| # | Feature | Status | Evidence / location | Gaps |
|---|---------|--------|---------------------|------|
| 1 | **AI Vision & multimodal** | 🟡 | `visionSupport.js`, chat image attach in `Chat.jsx`, Smart Router vision reroute in `controllers.js`, `vision-chat.test.mjs`, `/api/chat` with `hasAttachedImage` | Dedicated vision UX for multi-image progress; PDF-as-image OCR path; mobile camera polish; FastAPI preprocessing optional |
| 2 | **AI Tool Calling Engine** | ❌ | No central tool registry / schema validation layer | Calculator, CSV, sandbox Python, KB search as **tools** with chat UI status; `FEATURE_CODE_EXECUTOR` flag exists, no production sandbox wired |
| 3 | **AI Answer Verification** | 🟡 | Multi-agent **Verifier** step (`multiAgent/orchestrator.js`); `code-assistant.test.js` static checks; web citation pipeline | No user-facing “verified / partial / not verified” badge; no multi-language sandbox test runs; must not claim execution without sandbox |
| 4 | **Prompt Engineering Studio** | 🟡 | `Studio.jsx` (prompt templates, `{{vars}}`), `PromptGallery`, marketing routes to `/studio?tool=prompt`; workspace types include `prompt_version` | No dedicated 3-panel Prompt Studio UI; no A/B metrics from live runs; no version diff UI |
| 5 | **Real-Time Voice AI** | 🟡 | Browser STT + `speechSynthesis` in `Chat.jsx`; Kokoro via `/api/tts/*`, `ttsClient.js`, `voice-studio.test.mjs`; `FEATURE_VOICE_REALTIME=false` | No streaming TTS aligned with chat tokens; no full duplex “conversation mode” product flow; Kokoro requires Python service |
| 6 | **Intelligent Semantic Cache** | 🟡 | **Stage 1:** `smartApiCache.js` (user-scoped GET + in-flight dedupe); `webSearchCache.js` | **No** LLM response semantic cache; no embeddings similarity for answers; Zilliz used for memory/RAG not answer reuse |

---

## PART 2 — Nineteen platform improvements

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | AI Provider Health Monitor | ✅ | `providerHealthMonitor.js`, `healthMonitorService.js`, `/api/health/providers`, developer provider health UI |
| 2 | Automatic Failover | 🟡 | `automaticFallback.js`, Smart Router fallbacks, circuit breaker |
| 3 | Advanced Rate Limiting | 🟡 | `apiRateLimit.js`, `rateLimitStats.js`, ops center summaries; premium tiers env-dependent |
| 4 | Background Task Queue | 🟡 | Python job runner / webhooks (`aiPythonJobRunner.js`); no unified Redis queue product |
| 5 | Centralized Auth & Security | ✅ | Firebase + Clerk + sessions, `access-control`, `api-security`, `auth-security` tests |
| 6 | Advanced Streaming Chat UI | ✅ | SSE chat, `ChatResponseBlock`, animations, web search stages |
| 7 | Adaptive Mobile Interface | 🟡 | Responsive CSS, mobile dock, drawer; Playwright responsive specs |
| 8 | Global Command Palette | 🟡 | `CommandPalette.jsx` Ctrl/Cmd+K; limited fuzzy/commands vs spec |
| 9 | Personalized Workspace | 🟡 | Studio projects, dashboard, workspace items |
| 10 | Interactive AI Response Cards | 🟡 | Code blocks, citations, stickers; not full “card” system |
| 11 | Team Workspaces | 🟡 | Workspace type `team` in schema; limited multi-user product |
| 12 | AI Document Studio | 🟡 | Knowledge base + file manager feature flag; Studio documents |
| 13 | Project Memory & Knowledge Base | ✅ | RAG, `/knowledge`, Zilliz optional, user memory APIs |
| 15 | Smart Router 3.0 | 🟡 | `smartRouter2/` (classify, policy, telemetry); not full cost/latency ML scoring |
| 16 | Multi-Agent AI System | 🟡 | `multiAgent/orchestrator.js`, research SSE |
| 17 | Long-Term AI Memory | ✅ | `userMemoryService`, Zilliz store, settings UI |
| 21 | AI Quality Prediction Model | ❌ | Not found as dedicated model |
| 22 | Automated E2E Testing | 🟡 | Playwright e2e + CI smoke; matrix mostly local |
| 23 | AI Regression Testing | 🟡 | Router pytest + backend router tests; no live AI in CI |

**Also in repo (related):** Deep Research, Video/Magic Hour, AI Training Lab, Evaluation Lab (owner), AI Workflows (flag off), Ops/Admin metrics (`docs/PLATFORM_UPGRADE_PLAN.md`).

---

## PART 3 — Ten QA engineering systems

| # | System | Status | Location |
|---|--------|--------|----------|
| 1 | Registration testing | ✅ | `registration-auth-coverage.test.js`, `auth-validation.test.mjs`, critical suite |
| 2 | OAuth (Google/Firebase/Clerk) | 🟡 | Unit/integration tests; live OAuth manual (`docs/QA_MANUAL_DEVICES.md`) |
| 3 | Account linking / 409 | ✅ | `clerk-auth.test.js`, `clerk-session-exchange.test.mjs` |
| 4 | Session & security | ✅ | Critical backend/frontend session tests |
| 5 | Cross-browser / device | 🟡 | Playwright projects; CI = Chromium smoke only |
| 6 | Chat & streaming regression | 🟡 | `citation-links`, `chat-sse`, `split-message-parts`; extending critical list |
| 7 | Backend API & PostgreSQL | ✅ | ~194 backend test files, postgres auth paths |
| 8 | Payment & subscription | 🟡 | Stripe/WayForPay sandbox tests in critical suite |
| 9 | Performance & stability | ❌ | Documented budgets; no CI load tests |
| 10 | GitHub Actions quality gate | ✅ | `.github/workflows/ci.yml`, `qa/critical-*.json`, `docs/QA_SYSTEM.md` |

### Critical regression checklist (must stay green)

| Regression | Covered by |
|------------|------------|
| Clerk 409 `CLERK_LINK_REQUIRED` | `clerk-auth.test.js`, frontend clerk exchange tests |
| Google OAuth loading loops | `social-redirect-state`, `google-popup-sign-in`, ios-safari tests |
| Registration / verification | Backend auth register + email verification store tests |
| Citation null `forEach` | `citation-links.test.mjs` |
| Checkout redirect after auth | `pending-checkout.test.mjs`, `pro-subscription.test.mjs` |
| Language preference crashes | `ui-language.test.mjs`, settings render tests |

---

## PART 4 — UI/UX

🟡 **Mostly aligned** (dark/violet chat, glass nav, motion with components). Continue guarding: overflow tests, `prefers-reduced-motion`, no infinite loading on auth (session contract tests).

---

## PART 5 — Recommended implementation order (safe)

| Phase | Focus | Depends on |
|-------|--------|------------|
| **0** | This audit | — |
| **1** | Stability & QA | ✅ In progress (critical CI + docs) |
| **2** | Vision polish & routing | Existing `visionSupport` |
| **3** | Tool calling (non-Python first) | Registry + calculator/KB tools |
| **4** | Verification UX | Sandbox or static-only honesty |
| **5** | Prompt Studio UI | Studio API / workspace prompts |
| **6** | Voice (Kokoro + STT pipeline) | Python TTS health |
| **7** | Semantic cache stage 1→2 | Exact hash cache for prompts first |
| **8** | Platform items 1–19 | Per `PLATFORM_UPGRADE_PLAN.md` |
| **9** | Full QA + staging perf | Staging credentials |

---

## PART 6 — Security & feature flags

- **Flags:** `backend/src/platform/featureRegistry.js` (`FEATURE_CODE_EXECUTOR`, `FEATURE_VOICE_REALTIME`, `FEATURE_AI_FILE_MANAGER`, …).
- **Never enable** `FEATURE_CODE_EXECUTOR` without isolated sandbox URL.
- **Never** merge accounts by email alone (Clerk linking flows tested).

---

## PART 7 — Configuration blockers

| Capability | Typical requirement |
|------------|---------------------|
| Vision (Gemini/GPT/Claude) | Provider API keys on backend |
| Kokoro TTS | Python AI service + Kokoro deps (`docs/KOKORO_TTS.md`) |
| Zilliz memory | Milvus/Zilliz endpoint env |
| Live payments | Stripe/WayForPay + webhooks; `FEATURE_BILLING_LIVE_CHECKOUT` |
| Clerk | `CLERK_*` keys, publishable key on frontend |
| Semantic cache stage 2+ | Embeddings + policy service (optional Redis) |

---

## PART 8 — Progress checklist (living)

Use this table in phase completion reports:

- [x] Phase 0 — Repository audit (this document)
- [x] Phase 1 — Stability & QA (**complete** — see [Phase 1 acceptance](#phase-1-acceptance-criteria) below)
- [ ] Phase 2 — Vision hardening ([PHASE2_VISION_PLAN.md](./PHASE2_VISION_PLAN.md))
- [ ] Phase 3 — Tool registry (safe tools only)
- [ ] Phase 4 — Verification system
- [ ] Phase 5 — Prompt Studio
- [ ] Phase 6 — Voice conversation mode
- [ ] Phase 7 — LLM exact-match cache → semantic
- [ ] Phase 8 — Platform improvements (prioritized backlog)
- [ ] Phase 9 — Full regression + staging performance

**Related docs:** `docs/AI_ENGINEERING.md`, `docs/PLATFORM_UPGRADE_PLAN.md`, `docs/QA_SYSTEM.md`, `docs/QA_MANUAL_DEVICES.md`, `docs/PHASE2_VISION_PLAN.md`, `.github/BRANCH_PROTECTION.md`.

---

## Phase 1 acceptance criteria (completed)

| Criterion | Status |
|-----------|--------|
| Critical backend manifest covers auth, OAuth, Clerk 409, sessions, SSE, router fallback, Stripe webhook + idempotency, chat DB isolation | ✅ `qa/critical-backend.tests.json` (32 files) |
| Critical frontend manifest covers registration validation, OAuth helpers, chat SSE, citations, checkout, language | ✅ `qa/critical-frontend.tests.json` |
| PR workflow runs critical + build + Chromium smoke | ✅ `.github/workflows/ci.yml` |
| Cross-browser / mobile journeys (mocked API, no prod credentials) | ✅ `frontend/e2e/staging-journeys.spec.js` + weekly `qa-staging-e2e.yml` |
| Branch protection instructions | ✅ `.github/BRANCH_PROTECTION.md` |
| Live OAuth / real payments / production DB | ❌ Manual staging only (by design) |
| Local Playwright smoke (developer machine) | ⚠️ Blocked when disk full; CI Ubuntu runs smoke on every PR |

Requirement-to-test mapping: [qa/CRITICAL_BACKEND_COVERAGE.md](../qa/CRITICAL_BACKEND_COVERAGE.md).
