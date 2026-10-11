/**
 * Normalizes subscription/credits API payloads for UI consumption.
 */
export function normalizeCreditStatus(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.isOwner) {
    const userPreview = data.mode === 'user' || data.ownerPreview === true;
    const plusActive = userPreview
      ? false
      : (data.plusActive === true || data.mode === 'developer' || data.plusActive !== false);
    return {
      ...data,
      remaining: plusActive ? null : data.remaining,
      ownerUnlimited: plusActive,
      plusActive,
      subscriptionStatus: data.subscriptionStatus || 'owner',
    };
  }
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
  if (!data || typeof data !== 'object') return false;
  if (data.isOwner) return true;
  return normalizeCreditStatus(data) !== null;
}
