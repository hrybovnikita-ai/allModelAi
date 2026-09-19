# AllModelAI production foundation

## Session persistence on Vercel

The checked-in `vercel.json` routes frontend and `/api` through the same public
origin. Keep those rewrites: browsers must use relative `/api` URLs, including
Google's callback URL. No cross-site cookie or browser-visible backend URL is needed.

Vercel cannot host the application's persistent SQLite database. Its backend
service now proxies `/api` to `PERSISTENT_BACKEND_ORIGIN` instead of creating
per-instance `/tmp/database.sqlite` files. Without that setting it returns 503,
not a misleading 401 or a newly initialized empty database.

1. Run the backend on persistent hosting using the existing `render.yaml`, or a
   single server with a mounted persistent disk and `DB_FILE` on that disk.
   Do not run multiple independent SQLite instances or set `VERCEL` on this host.
2. Set `PERSISTENT_BACKEND_ORIGIN` in Vercel to that backend's HTTPS origin,
   with no path (for example `https://your-backend.onrender.com`). This is a
   server-only setting. Never point it at the frontend or another Vercel proxy.
3. On the persistent backend set `NODE_ENV=production`, `COOKIE_SECURE=true`,
   and `PUBLIC_URL` and `FRONTEND_ORIGIN` to the actual frontend HTTPS origin.
   Keep any existing `JWT_SECRET` stable across restarts. Rotating it invalidates
   JWT sessions. Opaque sessions work without a JWT secret and remain revocable.
4. For Google OAuth set `GOOGLE_REDIRECT_URI` to
   `https://your-frontend.example/api/auth/google/callback` in both the backend
   and Google Console. Do not use the separate backend host for that callback.
5. Redeploy both services. Verify register/login, `/api/auth/session`, refresh,
   chat and logout through the public frontend origin on mobile and desktop.

Cookies remain host-only, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
The browser sees one HTTPS origin even when Vercel proxies to a different host,
which avoids third-party-cookie restrictions in Safari. Express trusts one proxy;
CORS allows configured origins and the public forwarded host with credentials,
never a wildcard. API responses are not cached by the proxy or service worker.

Previously lost temporary databases cannot be recovered from cookies. Migrate
any existing durable SQLite file (including users and conversations) to the
persistent disk before switching traffic. Production setup requires the real
hosting URLs; `http://localhost:5173` is only the local Vite development server.

References: https://vercel.com/kb/guide/is-sqlite-supported-in-vercel and
https://vercel.com/docs/routing/rewrites.

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
- A single cloud image that serves the React app and `/api` together, so phones and tablets can chat while the developer machine is off. Use `render.yaml`, `fly.toml`, or `railway.json`.
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
