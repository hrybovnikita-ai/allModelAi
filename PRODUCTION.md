# AllModelAI production foundation

## Implemented in this repository

- Bearer API-key authentication with SHA-256 hashes, one-time secret display, expiry, request budgets, usage counters, and revocation.
- Persistent background-job records with progress stages, cancellation, results, and completion notifications.
- Notification inbox, global search, usage/cost/latency/fallback events, and per-account audit history.
- Short-lived email-verification and password-reset tokens. Resetting a password invalidates active sessions.
- Privacy export for account, conversation, and workspace data.
- Role fields on users and existing owner/editor/viewer enforcement on team workspaces.
- Signed-webhook registration and secret management. Secrets are displayed once and stored only as hashes.
- Public health endpoint with database and provider configuration checks.
- Docker images, Compose configuration, health checks, and GitHub Actions verification.
- Production Center UI at `/production`.

## Adapters required before a multi-instance public launch

The local application intentionally continues to use SQLite and an in-process job runner so it can run without infrastructure. For a horizontally scaled deployment:

1. Implement the `DATABASE_URL` PostgreSQL adapter and versioned SQL migrations.
2. Move job execution to Redis/BullMQ or another durable worker service. The existing job table and API are the contract for that worker.
3. Add PDF/DOCX parsers and an isolated OCR worker for binary document ingestion.
4. Connect account-token delivery to Resend using `RESEND_API_KEY` and `EMAIL_FROM`.
5. Deliver signed webhook events and persist attempts/retries; registration and secret storage are already implemented.
6. Connect `SENTRY_DSN`, centralized structured logs, dashboards, and alerts.
7. Add Playwright browser journeys in CI for authentication, chat, research, payments, and account deletion.

Do not set `EXPOSE_ACCOUNT_TOKENS=true` in production. It exists only for local integration testing.
