import { apiFetch } from './api.js';

/**
 * Start Lemon Squeezy hosted checkout for the signed-in user.
 * @returns {Promise<string>} checkout URL
 */
export async function startLemonSqueezyCheckout({
  userId,
  variantId = '2308479',
  signal,
} = {}) {
  const response = await apiFetch('/api/payments/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      variantId: String(variantId),
    }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.code || 'Could not start Lemon Squeezy checkout.');
  }
  if (!data.checkoutUrl) {
    throw new Error('Checkout URL was missing from the server response.');
  }
  return data.checkoutUrl;
}
