# Critical backend manifest — requirement mapping

Source list: `qa/critical-backend.tests.json` (33 test files).

| Requirement | Primary test file(s) |
|-------------|----------------------|
| Email/password registration | `auth.test.js`, `registration-auth-coverage.test.js`, `auth-postgres-register-logout-login.test.js` |
| Email verification / unverified login | `registration-auth-coverage.test.js`, `social-auth.test.js` (unverified token), `auth-postgres-firebase-social.test.js` |
| Google OAuth | `auth-postgres-firebase-social.test.js`, `social-auth.test.js`, `google-password-dual-auth.test.js` |
| Clerk authentication | `clerk-auth.test.js` |
| Account linking / HTTP 409 | `clerk-auth.test.js` (`CLERK_LINK_REQUIRED`) |
| Session security | `auth-security.test.js`, `session-cookie-native-token.test.js`, `session-contract-regression.test.js`, `session-persistence.test.js` |
| Chat SSE streaming | `deep-research-sse-stages.test.js` |
| Smart Router fallback | `router-fallback-regression.test.js`, `automatic-fallback.test.js` |
| Payment webhook signature | `ai-credits.test.js`, `platform-upgrade.test.js` (HMAC + replay) |
| Subscription activation | `subscription-payments.test.js`, `payment-sandbox.test.js` |
| Webhook idempotency | `ai-credits.test.js`, `platform-upgrade.test.js` (`rememberEvent`) |
| User / DB isolation | `multi-user-auth.test.js`, `postgres-http-chat-guard.test.js`, `access-control.test.js` |

Full backend suite (`npm test` in `backend/`) remains the broader safety net in CI after critical runs.
