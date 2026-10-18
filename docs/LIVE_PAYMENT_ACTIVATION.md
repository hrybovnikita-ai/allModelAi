# AllModelAI — Live payment activation checklist

**Status:** Software supports real Stripe Checkout Sessions. Live card charges stay **blocked** until you explicitly approve activation and complete merchant verification.

Do **not** set `FEATURE_BILLING_LIVE_CHECKOUT=true` until every step below is done.

## What already works (test mode)

- Subscription Checkout Sessions (`mode: subscription`, Payment Element / hosted)
- One-time AI credit Checkout Sessions (`mode: payment`)
- Verified Stripe webhooks with event idempotency
- Billing portal for Stripe customers
- WayForPay / Paddle paths remain available without migrating existing subscribers

## Root cause of “Stripe Test Mode — No real charges” on production

The banner appears when the backend uses **test** Stripe credentials (`sk_test_` / `STRIPE_MODE=test`). That is intentional. Removing the banner while still using test keys would be misleading.

If the page previously showed a **demo / preview card form**, that was the MockCheckout fallback when no provider was available. That fake form is no longer shown when payments are unconfigured.

## Render environment variables (names only)

Required for Stripe test or live:

- `PAYMENT_PROVIDER=stripe`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY` (also sync / set `VITE_STRIPE_PUBLISHABLE_KEY` if the frontend reads it at build time)
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_MODE=test` (keep until go-live)

Optional price IDs:

- `STRIPE_PRICE_PRO_MONTHLY` (Pro $15/mo)
- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_PRICE_UNLIMITED_MONTHLY`
- `STRIPE_PRICE_AI_CREDITS_STARTER|PLUS|PRO|ULTIMATE`

Live activation (only after approval):

- `FEATURE_BILLING_LIVE_CHECKOUT=true`
- `AI_CREDITS_ALLOW_LIVE_CHECKOUT=true` (for credit packs)
- `STRIPE_MODE=live`
- Live `sk_live_` / `pk_live_` / live `whsec_`

Admin:

- `ADMIN_KEY` (for `/admin` Payments tab)

## Vercel

- Redeploy frontend after checkout UI changes
- Do **not** put Stripe secret keys on Vercel
- Publishable key may be present as `VITE_STRIPE_PUBLISHABLE_KEY` if required by the build; prefer serving publishable key from `GET /api/payments/config`

## Stripe Dashboard steps

1. Complete Business details / identity verification for the **actual** registered country and legal entity.
2. Add and verify a **payout bank account** (Stripe → Settings → Bank accounts and scheduling).
3. Create Products/Prices for Pro ($15/mo) and AI credit packs, or rely on server `price_data`.
4. Add webhook endpoint: `https://<render-backend>/api/payments/webhook`
5. Subscribe at least to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `charge.refunded`
   - `charge.dispute.created`
   - `payment_intent.succeeded` (if used)
6. Copy the webhook signing secret into Render as `STRIPE_WEBHOOK_SECRET`.

## Owner admin tools

With `ADMIN_KEY`:

- `GET /api/admin/payments/activation-readiness` — software + manual checklist
- `GET /api/admin/payments/revenue` — Stripe balance / payouts (API-backed, not invented)
- Admin UI → **Payments** tab

## Enabling live charges (only with your explicit approval)

1. Confirm KYC + payout bank approved in Stripe.
2. Swap Render to live keys and live webhook secret.
3. Set `STRIPE_MODE=live`.
4. Set `FEATURE_BILLING_LIVE_CHECKOUT=true`.
5. Optionally set `AI_CREDITS_ALLOW_LIVE_CHECKOUT=true`.
6. Redeploy backend.
7. Run one real $1 smoke payment and refund it.
8. Confirm `/checkout/pro` no longer shows the test-mode banner.
9. Confirm Admin → Payments shows `liveChargesAllowed: true`.

## Existing WayForPay / other subscribers

- Do not migrate them automatically.
- Do not create a second recurring subscription for the same user/plan.
- Checkout returns conflict when an active matching subscription already exists and offers billing management instead.
