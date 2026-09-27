const PLAN_UI_LABELS = {
  free: 'Common',
  common: 'Common',
  pro: 'Pro Monthly',
  plus: 'Power Monthly',
  power: 'Power Monthly',
  week: 'Weekly',
  weekly: 'Weekly',
  developer: 'Developer',
};

const normalizeSlug = (key) => {
  const k = String(key || 'free').toLowerCase();
  if (k === 'common' || k === 'monthly') return 'pro';
  if (k === 'plus' || k === 'enterprise') return 'power';
  if (k === 'weekly') return 'week';
  return k;
};

/** Never show raw internal billing keys (common/plus) on Dashboard. */
export function formatSubscriptionPlanLabel(status) {
  if (!status) return 'Common';
  if (status.currentPlan) return status.currentPlan;
  if (status.planDisplayName) return status.planDisplayName;
  const key = normalizeSlug(status.planKey || status.planSlug || status.plan);
  return PLAN_UI_LABELS[key] || key;
}
