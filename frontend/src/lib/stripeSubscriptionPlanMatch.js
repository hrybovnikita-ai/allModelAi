export function subscriptionMatchesCheckoutPlan(subscription, planSlug) {
  if (!subscription?.hasSubscription || !subscription?.active) return false;
  const keys = [subscription.planKey, subscription.planSlug, subscription.plan].filter(Boolean);
  if (planSlug === 'starter') {
    return keys.some((key) => key === 'starter');
  }
  if (planSlug === 'pro') {
    return keys.some((key) => key === 'pro' || key === 'common');
  }
  if (planSlug === 'enterprise' || planSlug === 'unlimited') {
    return keys.some((key) => key === 'enterprise' || key === 'plus' || key === 'unlimited');
  }
  if (planSlug === 'upgrade-plus') {
    return keys.some((key) => key === 'upgrade-plus' || key === 'upgrade_plus');
  }
  if (planSlug === 'pro-plus') {
    return keys.some((key) => key === 'pro-plus' || key === 'upgrade_pro_plus');
  }
  if (planSlug === 'ultra') {
    return keys.some((key) => key === 'ultra' || key === 'upgrade_ultra');
  }
  return keys.includes(planSlug);
}
