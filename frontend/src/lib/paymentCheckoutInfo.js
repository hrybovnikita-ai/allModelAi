import { nativeClientHeaders, resolveApiUrl } from './apiBase.js';
import { parseJsonResponse } from './httpJson.js';

export const TEST_MODE_BANNER = 'TEST MODE — No real money will be charged';

export async function fetchCheckoutInfo() {
  try {
    const response = await fetch(resolveApiUrl('/api/payments/checkout-info'), {
      credentials: 'include',
      headers: { Accept: 'application/json', ...nativeClientHeaders() },
    });
    if (!response.ok) return null;
    return parseJsonResponse(response);
  } catch {
    return null;
  }
}

export async function fetchCheckoutPlan(slug) {
  const response = await fetch(resolveApiUrl(`/api/payments/plans/${encodeURIComponent(slug)}`), {
    credentials: 'include',
    headers: { Accept: 'application/json', ...nativeClientHeaders() },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Could not load plan details.');
  }
  return response.json();
}
