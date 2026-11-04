/** Public upgrade checkout slugs — amounts/limits must match backend billing/plans.js */
export const UPGRADE_CHECKOUT_SLUGS = ['upgrade-plus', 'pro-plus', 'ultra'];

export const UPGRADE_PLANS_STATIC = [
  {
    slug: 'upgrade-plus',
    name: 'Plus',
    priceLabel: '$20',
    interval: 'month',
    requestLimit: 2000,
    featured: false,
    tagline: 'Essential premium access for daily AI work',
    features: [
      'Premium AI models',
      '2,000 requests per month',
      'Priority routing',
      'Image generation',
      'Knowledge Base',
      'Email support',
    ],
  },
  {
    slug: 'pro-plus',
    name: 'Pro+',
    priceLabel: '$40',
    interval: 'month',
    requestLimit: 5000,
    featured: true,
    tagline: 'Best balance of power, limits, and priority',
    features: [
      'Full premium model access',
      '5,000 requests per month',
      'Priority routing & Smart Router',
      'Image generation',
      'Knowledge Base & Deep Research',
      'Priority support',
    ],
  },
  {
    slug: 'ultra',
    name: 'Ultra',
    priceLabel: '$80',
    interval: 'month',
    requestLimit: 12000,
    featured: false,
    tagline: 'Maximum models, limits, and routing priority',
    features: [
      'All connected providers',
      '12,000 requests per month',
      'Highest routing priority',
      'Image generation & Code Studio',
      'Knowledge Base & workflows',
      'Dedicated support',
    ],
  },
];

export function checkoutPathForUpgradeSlug(slug) {
  return `/checkout?plan=${encodeURIComponent(slug)}`;
}

const UPGRADE_SLUG_ALIASES = new Set([
  ...UPGRADE_CHECKOUT_SLUGS,
  'upgrade-pro',
  'upgrade-ultra',
]);

export function isUpgradeCheckoutSlug(slug) {
  return UPGRADE_SLUG_ALIASES.has(String(slug || '').toLowerCase());
}
