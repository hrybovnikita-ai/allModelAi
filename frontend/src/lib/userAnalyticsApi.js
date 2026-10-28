const DEFAULT_MAX_AGE_MS = 60_000;

let cached = null;
/** @type {Promise<object|null>|null} */
let inflight = null;

/**
 * Cached /api/analytics fetch — reduces repeated Postgres aggregate work on dashboard revisits.
 */
export async function fetchUserAnalytics(apiFetch, { maxAgeMs = DEFAULT_MAX_AGE_MS, force = false, signal } = {}) {
  const now = Date.now();
  if (!force && cached && now - cached.at < maxAgeMs) {
    return cached.data;
  }
  if (!force && inflight) {
    return inflight;
  }

  inflight = apiFetch('/api/analytics', { skipAuthRedirect: true, signal })
    .then(async (response) => {
      if (!response.ok) return null;
      const data = await response.json().catch(() => null);
      if (data && typeof data === 'object') {
        cached = { at: Date.now(), data };
      }
      return data;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function invalidateUserAnalyticsCache() {
  cached = null;
}
