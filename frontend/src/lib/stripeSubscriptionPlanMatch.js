export function subscriptionMatchesCheckoutPlan(subscription, planSlug) {
  if (!subscription?.hasSubscription || !subscription?.active) return false;
  const keys = [subscription.planKey, subscription.planSlug, subscription.plan].filter(Boolean);
  if (planSlug === 'pro') {
    return keys.some((key) => key === 'pro' || key === 'common');
  }
  if (planSlug === 'enterprise') {
    return keys.some((key) => key === 'enterprise' || key === 'plus' || key === 'unlimited');
  }
  return keys.includes(planSlug);
}
