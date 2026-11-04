import { UPGRADE_PLANS_STATIC } from './upgradePlansCatalog';

/** Canonical public checkout slugs sent to POST /api/payments/checkout */
const SLUG_ALIASES = {
  starter: 'starter',
  pro: 'pro',
  common: 'pro',
  unlimited: 'unlimited',
  enterprise: 'unlimited',
  power: 'unlimited',
  plus: 'unlimited',
  'upgrade-plus': 'upgrade-plus',
  'upgrade-pro': 'pro-plus',
  'pro-plus': 'pro-plus',
  pro_plus: 'pro-plus',
  proplus: 'pro-plus',
  upgrade_pro_plus: 'pro-plus',
  'upgrade-ultra': 'ultra',
  ultra: 'ultra',
  developer: 'developer',
};

export function normalizeCheckoutPlanSlug(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return null;
  return SLUG_ALIASES[key] || null;
}

export function planSlugFromPath(pathname) {
  const path = String(pathname || '').toLowerCase();
  if (path.endsWith('/enterprise') || path.endsWith('/unlimited')) return 'unlimited';
  if (path.endsWith('/starter')) return 'starter';
  if (path.endsWith('/developer')) return 'developer';
  if (path.endsWith('/upgrade-plus')) return 'upgrade-plus';
  if (path.endsWith('/upgrade-pro') || path.endsWith('/pro-plus')) return 'pro-plus';
  if (path.endsWith('/pro')) return 'pro';
  if (path.endsWith('/upgrade-ultra') || path.endsWith('/ultra')) return 'ultra';
  return 'pro';
}

export function resolveCheckoutPlanSlug(searchParams, pathname) {
  const fromQuery = normalizeCheckoutPlanSlug(searchParams?.get?.('plan'));
  if (fromQuery) return fromQuery;
  return planSlugFromPath(pathname);
}

/** API body.plan — same slug the backend resolvePaidCheckoutPlan accepts */
export function checkoutApiPlanSlug(canonicalSlug) {
  return canonicalSlug;
}

function staticUpgradeQuote(slug) {
  const row = UPGRADE_PLANS_STATIC.find((p) => p.slug === slug);
  if (!row) return null;
  const amount = String(row.priceLabel).replace(/[^0-9.]/g, '');
  return {
    slug: row.slug,
    name: row.name,
    amountDisplay: amount.includes('.') ? amount : `${Number(amount).toFixed(2)}`,
    currency: 'USD',
    interval: row.interval,
    requestLimit: row.requestLimit,
    features: row.features,
  };
}

export function staticFallbackPlanQuote(slug) {
  const canonical = normalizeCheckoutPlanSlug(slug) || slug;
  return staticUpgradeQuote(canonical);
}
