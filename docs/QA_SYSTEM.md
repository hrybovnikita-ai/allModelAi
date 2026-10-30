# AllModelAI — QA automation system

Master plan context: [MASTER_DEVELOPMENT_PLAN_AUDIT.md](./MASTER_DEVELOPMENT_PLAN_AUDIT.md) (Phase 0 checklist + phased rollout).

## Phases

| Phase | Scope | Status |
|-------|--------|--------|
| 0 | Audit existing tests & CI | Done (see `qa/*.json` manifests) |
| 1 | Auth, OAuth, Clerk 409, sessions, payments webhooks, SSE, router | **Complete** — `qa/critical-*.json`, PR job `verify` |
| 2 | Chat, backend API, payments | Covered by critical + full backend suite in CI |
| 3 | Playwright matrix & performance | PR: Chromium `@smoke`; weekly `@staging` matrix (`.github/workflows/qa-staging-e2e.yml`) |
| 4 | GitHub Actions quality gate | `.github/workflows/ci.yml` + branch protection doc |
| 5 | QA report & defects | CI artifacts + Model Diagnostics QA panel |

## Commands

```bash
# Release-blocking regression (auth, checkout, citations, payments config)
npm run test:critical

# Full unit suites (CI skips heavy frontend: chat-compatibility, everyday-ai)
npm test

# Playwright smoke (Chromium only, no live AI/payments)
cd frontend && npx playwright install chromium --with-deps && npm run test:e2e:smoke

Local E2E requires ~500MB+ free disk for browser binaries. If install fails (e.g. disk full), rely on GitHub Actions job **verify** (Chromium smoke) and weekly **QA Staging E2E**.

# Full cross-browser / mobile projects (local)
cd frontend && npx playwright test

# Record QA summary for developer dashboard (after critical + smoke)
npm run qa:record
```

## CI behavior

- **Secret scan**, lint, build, Python router tests (unchanged).
- **Backend critical** then **full backend** tests.
- **Frontend critical** then **full frontend** (heavy tests skipped unless `CI_RUN_HEAVY_FRONTEND_TESTS=true`).
- **Playwright smoke** (`@smoke`, Chromium).
- **npm audit** (high severity fails; moderate reported).
- Artifacts: `playwright-report`, `qa-reports/`, `backend/data/qa-last-run.json` (when record step runs).

## What is not run in ordinary CI

- Live AI provider calls (Model Diagnostics billable tests remain manual).
- Real Stripe/WayForPay charges (sandbox/unit tests only).
- OAuth against production Google/Clerk accounts (use unit tests + staging manual checklist).
- Load tests against production (staging only; see performance section below).

## Extending coverage

Add filenames to:

- `qa/critical-backend.tests.json`
- `qa/critical-frontend.tests.json`

Manifest tests (`qa-critical-manifest.test.*`) fail if listed files are missing.

## Branch protection (GitHub)

Require status check **AllModelAI CI / verify** on `main`:

1. Settings → Branches → Add rule → Require status checks.
2. Select job **verify** from workflow **AllModelAI CI**.

## Performance & load

Use staging with explicit limits. Suggested budgets (configure in your runner):

- `/login` TTFB + shell paint &lt; 3s on 4G throttling.
- `/api/health` &lt; 500ms p95 on staging.
- Chat stream first token: monitor in staging only; do not load-test production.

## Related

- Manual real-device steps: [QA_MANUAL_DEVICES.md](./QA_MANUAL_DEVICES.md)
