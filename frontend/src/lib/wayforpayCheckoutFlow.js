import { isMockTestCardNumber } from './paymentCardFormat.js';
import {
  createWayforpayCheckout,
  runTestWayforpayCheckout,
  submitWayforpayCheckout,
} from './wayforpay.js';

/**
 * True when checkout should simulate payment (no redirect to WayForPay).
 */
export function shouldSimulateWayforpayCheckout({
  serverTestMode = false,
  developerMode = false,
  cardNumber = '',
  forceLive = false,
} = {}) {
  if (forceLive) return false;
  if (developerMode) return true;
  if (serverTestMode) return true;
  if (import.meta.env?.DEV && isMockTestCardNumber(cardNumber)) return true;
  if (isMockTestCardNumber(cardNumber)) return true;
  return false;
}

export async function executeWayforpayCheckout({
  httpClient,
  planKey,
  currency,
  serverTestMode,
  developerMode,
  cardNumber,
  developerPayload,
}) {
  const simulate = shouldSimulateWayforpayCheckout({
    serverTestMode,
    developerMode,
    cardNumber,
  });

  if (developerMode && developerPayload) {
    const isAxios = typeof httpClient?.post === 'function';
    if (isAxios) {
      const response = await httpClient.post('/api/payments/mock-subscribe', developerPayload, {
        withCredentials: true,
      });
      return { mode: 'developer', data: response.data };
    }
    const response = await httpClient('/api/payments/mock-subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(developerPayload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Developer activation failed.');
    return { mode: 'developer', data };
  }

  if (simulate) {
    const data = await runTestWayforpayCheckout(httpClient, planKey);
    return { mode: 'test', data };
  }

  const data = await createWayforpayCheckout(httpClient, { plan: planKey, currency });
  if (data.mockCheckout) {
    const testData = await runTestWayforpayCheckout(httpClient, planKey);
    return { mode: 'test', data: testData };
  }
  submitWayforpayCheckout(data);
  return { mode: 'redirect', data };
}
