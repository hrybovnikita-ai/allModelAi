AllModelAI

SQL database setup and verification: [DATABASE.md](DATABASE.md).

Phone and tablet on home Wi-Fi: double-click `start-home-server.bat`, then open the address in `HOME-ACCESS.txt`. The server runs in the background after you close the editor and startup window. See [HOME-WIFI.md](HOME-WIFI.md) for instructions and connection help.

A unified workspace for multiple AI models: secure chat, an explainable Smart Router, a knowledge base, AI Arena, and team workspaces.

Getting Started
cd backend

Copy-Item .env.example .env

npm install

npm start

In a second terminal:

cd frontend

npm install

npm run dev

The frontend will be available at http://localhost:5173, and the backend at http://localhost:5050.

Access from a phone or tablet while this computer is off

The chat API and the website now run as one cloud-ready process. A laptop, Cursor, and Vite do not need to stay open. Deploy the repository to a host that stays online:

1. Push this project to GitHub.
2. Create a [Render](https://render.com) Web Service from `render.yaml`, or use Railway / Fly.io with the included `Dockerfile`.
3. Copy API keys from `backend/.env` into the host environment. Never commit that file.
4. Set `PUBLIC_URL` and `FRONTEND_ORIGIN` to the HTTPS URL Render shows, for example `https://allmodelai.onrender.com`.
5. Open that URL on a phone, tablet, or another computer. Sign in and chat. Add the site to the home screen from the browser menu for an app-like shortcut.

Keep `COOKIE_SECURE=true` on HTTPS. The SQLite database is stored on the attached disk so conversations survive restarts.

Production mode without VS Code

After building the frontend, the backend serves the complete application from one port. On Windows, double-click `start-allmodelai.bat` in the `allModelAi` folder. It builds `frontend/dist` when needed and starts the app at http://localhost:5050. Keep the opened server window running; the editor itself can be closed.

To stop the application, close that server window or press Ctrl+C in it. The SQLite database remains in `backend/storage/database.sqlite`.

New Features
All private APIs use a server-side HTTP-only session; an email address provided by the client does not determine data ownership.
Smart Router detects the task type and returns the selected model along with an explanation.
Documents from Studio are indexed locally and automatically added to the AI context with [KB1] and [KB2] labels.
Team Workspace supports the owner, editor, and viewer roles.
A saved chat can be published using a randomly generated read-only link.
Innovation Lab adds ranked chunk-based document retrieval, persistent AI agents, configurable provider fallback, voice/file prompt composition, and repeatable multi-model evaluations.
Expansion Hub adds visual workflows, installable templates, meeting analysis, team rooms, a memory graph, prompt versioning, local security scans, Ollama status, guided research, and hashed developer API-key management.
Skills Hub provides structured experts for data analysis, career documents, code repositories, SEO, contracts, customer support, learning, marketing, databases, software localization, and Deep Research. Deep Research performs two to four web-search passes, deduplicates sources, builds an evidence dossier, and generates a cited report. Skill inputs, sources, and generated prompts are saved as restorable sessions.
The extended skill library also includes financial planning, scientific research, UI/UX design, defensive cybersecurity, product management, startup validation, ethical sales assistance, social media production, presentation planning, healthcare information, travel planning, and personal productivity. High-stakes financial and health outputs include explicit professional-advice and emergency-safety boundaries.
Production Center adds authenticated public API keys, persistent job state, notifications, global search, usage and cost records, audit history, webhook registration, privacy export, account-security tokens, health checks, Docker deployment, and CI. See `PRODUCTION.md` for the implemented/local boundary and the external adapters required for a multi-instance launch.
Verification
cd backend

npm test

cd ../frontend

npm run lint

npm run build

Secrets are stored only in backend/.env. The demo social account selection feature is disabled by default and must not be enabled in production.

Authentication

Sign in at `/login` or create an account at `/register`. Private workspace pages verify the server session before rendering and return you to the requested page after sign-in. Remember me is enabled by default and keeps the HTTP-only session cookie for 30 days, including browser restarts. Explicitly turning it off uses a browser-session cookie with an 8-hour server expiry. Login and registration verify the cookie before navigation; browser storage is only a profile cache. Sign out revokes the session without deleting the account. Passwordless accounts must use their original provider or the password recovery flow; public login and registration cannot assign a password to an existing account. The legacy ALLOW_ANY_PASSWORD bypass is no longer supported.

Image generation

In Chat, select “Создать изображение”, describe the picture, and send. Requests beginning with “Нарисуй” also trigger generation. Results can be enlarged, downloaded, and restored from conversation history (except temporary chats).

The server uses IMAGE_API_KEY, OPENAI_API_KEY, or the legacy OPEN_AI_API_KEY. IMAGE_API_URL and IMAGE_MODEL support a configured compatible endpoint. For Cloudflare, set IMAGE_PROVIDER=cloudflare, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_API_KEY; the legacy CLAUDEFLARE_API_KEY spelling is supported. Keep all keys in backend/.env. A 429 response requires checking provider quota/balance or retrying later.

User / Developer access

The chat header switch stores the chosen mode on the server. User exposes five models without an AllModelAI subscription: Gemini, Llama, DeepSeek, Mistral, and Qwen. Smart Router and fallback stay within that list. Active paid subscriptions and accounts in DEVELOPER_EMAILS unlock Developer mode with all models and no application credit cap. Developer accounts default to Developer; selecting User previews the restricted experience. Canceled or expired subscriptions revert to User. External provider pricing, balances, rate limits and configured API keys still apply. Restart the backend after updating to apply the account_access_modes schema.

## Rainbow effects, JWT, and caching

The homepage includes animated rainbow cards, gradient text, pointer spotlights,
floating glows, and working links to models, chat, and prompts. Pause effects
stops motion; operating-system reduced-motion preferences are respected.

Set JWT_SECRET in backend/.env to a cryptographically random secret of at least
32 bytes to enable signed JWT login cookies. Generate one locally with:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
Restart the backend, then sign in again. No secret is shipped in the repository.
Without JWT_SECRET, opaque sessions remain supported. Existing sessions remain
valid until expiry or revocation. JWTs use HS256, issuer/audience validation,
and the existing 8-hour/30-day expiry. Every request still checks the database,
so logout and account deletion revoke access. Tokens stay in HTTP-only cookies.

Set REDIS_URL to connect a shared Redis cache. Docker Compose includes an internal
Redis service without exposing its port. For local development, supply your own
Redis URL; without one the bounded in-memory fallback works automatically.
Only public /api/status/models responses are cached, for 30 seconds, with
X-Cache: HIT or MISS. Redis commands have a 250ms cache wait budget.
The frontend caches this public response for 10 seconds and combines concurrent
requests. Authentication, chats, payments, and personal data are never cached by
these new caches. Provider configuration is not a real-time uptime guarantee.

Library references: [JWT](https://github.com/auth0/node-jsonwebtoken) and
[Redis](https://redis.io/docs/latest/develop/clients/nodejs/produsage/).

## Provider connection checks

Run `npm --prefix backend run providers:check` from the project directory. This loads `backend/.env` independently of the working directory and checks provider authentication without generating content or printing secrets. A successful check does not prove generation quota or access to every model.

For Kimi, set `KIMI_BASE_URL=https://api.moonshot.ai/v1` for international keys; the legacy default is `https://api.moonshot.cn/v1`. These regions use separate keys. See https://forum.moonshot.ai/t/mcp-use-for-kimi-k2-when-used-through-the-moonshot-api/90. Set `GROK_PROVIDER=openrouter` to route Grok through `OPENROUTER_API_KEY` (or legacy `API_KEY`) while retaining the direct xAI key. Restart the backend after changing `.env`.

Set `KIMI_PROVIDER=openrouter` to use the configured OpenRouter key for Kimi while retaining the Moonshot key. Exact selections remain exact: K2 uses `moonshotai/kimi-k2` and K2.5 uses `moonshotai/kimi-k2.5`. OpenRouter billing applies to these requests.
