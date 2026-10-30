# Manual QA — real devices (supplement to Playwright)

Run after a green `npm run test:critical` and smoke E2E on desktop.

## iPhone (Safari)

- [ ] Open https://all-model-ai.com/login — Google button visible, no horizontal scroll
- [ ] Register with new email (staging/test account) — no infinite spinner
- [ ] Email verification UI — invalid code shows error; resend works
- [ ] Clerk sign-in — if 409 link required, linking UI appears (no silent failure)
- [ ] Logout — protected routes redirect to login
- [ ] Chat — send message, stream renders, cancel stops generation
- [ ] Settings — Clerk connect section loads
- [ ] Pricing → Pro — redirects to login when logged out, returns to checkout when logged in

## iPad (Safari)

- [ ] Chat sidebar toggle at 768–1024 widths
- [ ] Checkout summary readable; no clipped pay button
- [ ] Landscape + portrait on `/chat` and `/pricing`

## Android (Chrome)

- [ ] Google OAuth popup/redirect (provider config dependent)
- [ ] Session persists after app backgrounding 2 minutes
- [ ] Keyboard does not cover password field on login

## OAuth cancellation

- [ ] Start Google sign-in, cancel — user stays on login, no duplicate account toast loop

## Notes

- Never use production owner accounts for destructive tests.
- Document failures in GitHub Issues with device OS version and browser version.
