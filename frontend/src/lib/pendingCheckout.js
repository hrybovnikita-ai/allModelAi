const STORAGE_KEY = 'allmodelai_pending_checkout';
const MAX_AGE_MS = 30 * 60 * 1000;
const ALLOWED_PLANS = new Set(['starter', 'pro', 'unlimited']);

export function normalizeSubscriptionPlan(raw) {
  const slug = String(raw || '').trim().toLowerCase();
  if (slug === 'common') return 'pro';
  if (slug === 'enterprise' || slug === 'plus' || slug === 'power') return 'unlimited';
  return ALLOWED_PLANS.has(slug) ? slug : null;
}

export function checkoutPathForPlan(raw) {
  const plan = normalizeSubscriptionPlan(raw);
  if (!plan) return null;
  return `/checkout?plan=${encodeURIComponent(plan)}`;
}

/** Accept only in-app subscription checkout paths. */
export function safeCheckoutReturnPath(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  let url;
  try {
    url = new URL(value, 'https://all-model-ai.local');
  } catch {
    return null;
  }
  if (url.origin !== 'https://all-model-ai.local') return null;
  if (url.pathname !== '/checkout') return null;
  return checkoutPathForPlan(url.searchParams.get('plan'));
}

function readStore() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    if (Date.now() - Number(parsed.savedAt || 0) > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const path = checkoutPathForPlan(parsed.plan);
    return path ? { plan: normalizeSubscriptionPlan(parsed.plan), path } : null;
  } catch {
    return null;
  }
}

export function savePendingCheckout(plan) {
  const path = checkoutPathForPlan(plan);
  if (!path || typeof sessionStorage === 'undefined') return null;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    plan: normalizeSubscriptionPlan(plan),
    savedAt: Date.now(),
  }));
  return path;
}

export function peekPendingCheckoutPath() {
  return readStore()?.path || null;
}

export function clearPendingCheckout() {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function consumePendingCheckoutPath() {
  const path = peekPendingCheckoutPath();
  clearPendingCheckout();
  return path;
}

export function resolvePostAuthDestination(locationFrom) {
  return safeCheckoutReturnPath(locationFrom) || peekPendingCheckoutPath() || null;
}
