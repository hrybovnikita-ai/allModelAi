/**
 * Normalizes subscription/credits API payloads for UI consumption.
 */
export function normalizeCreditStatus(data) {
  if (!data || typeof data !== 'object') return null;
  const remaining = typeof data.remaining === 'number'
    ? data.remaining
    : typeof data.requestsRemaining === 'number'
      ? data.requestsRemaining
      : null;
  if (remaining === null) return null;
  return {
    ...data,
    remaining,
    subscriptionStatus: data.subscriptionStatus || (data.hasSubscription ? 'active' : 'free'),
  };
}

export function isCompleteCreditStatus(data) {
  return normalizeCreditStatus(data) !== null;
}
