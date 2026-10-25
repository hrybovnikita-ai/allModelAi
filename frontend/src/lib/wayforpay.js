import { isCapacitorNative } from './apiBase.js';
import { isElectronShell, submitHostedPaymentForm } from './nativePlatform.js';

/**
 * POST redirect to WayForPay hosted checkout (merchantSignature is prepared on the server).
 */
export function submitWayforpayCheckout(checkoutPayload) {
  const payUrl = checkoutPayload?.payUrl;
  const fields = checkoutPayload?.fields;
  if (checkoutPayload?.mockCheckout || checkoutPayload?.testMode) {
    throw new Error('Test mode: complete payment using the test checkout button on this page.');
  }
  if (!payUrl || !fields) {
    throw new Error('WayForPay checkout payload is incomplete.');
  }
  const useSystemBrowser = isElectronShell() || isCapacitorNative();
  return submitHostedPaymentForm({
    payUrl,
    fields,
    openInSystemBrowser: useSystemBrowser,
  });
}

export async function createWayforpayCheckout(httpClient, { plan, currency, packageId, purchaseType }) {
  const isAxios = typeof httpClient?.post === 'function';
  const body = {
    ...(plan ? { plan } : {}),
    ...(packageId ? { packageId } : {}),
    ...(purchaseType ? { purchaseType } : {}),
    ...(currency ? { currency } : {}),
  };
  const path = packageId || purchaseType === 'ai_credits'
    ? '/api/payments/wayforpay/credit-checkout'
    : '/api/payments/wayforpay/create';
  if (isAxios) {
    const response = await httpClient.post(path, body, { withCredentials: true });
    return response.data;
  }
  const response = await httpClient(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.userMessage || 'Could not start WayForPay checkout.');
  }
  return data;
}

/** Single-step WayForPay TEST MODE checkout (create + simulated callback). */
export async function runTestWayforpayCheckout(axiosOrFetch, plan) {
  const isAxios = typeof axiosOrFetch?.post === 'function';
  if (isAxios) {
    const response = await axiosOrFetch.post(
      '/api/payments/wayforpay/test-checkout',
      { plan },
      { withCredentials: true },
    );
    return response.data;
  }
  const response = await axiosOrFetch('/api/payments/wayforpay/test-checkout', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Test payment could not be completed.');
  }
  return data;
}

export async function completeMockWayforpayCheckout(axiosOrFetch, orderReference) {
  const isAxios = typeof axiosOrFetch?.post === 'function';
  if (isAxios) {
    const response = await axiosOrFetch.post('/api/payments/wayforpay/mock-complete', { orderReference }, { withCredentials: true });
    return response.data;
  }
  const response = await axiosOrFetch('/api/payments/wayforpay/mock-complete', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderReference }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Mock payment could not be completed.');
  }
  return response.json();
}

export async function pollWayforpayPaymentStatus(apiFetch, orderReference, { attempts = 15, intervalMs = 2000 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const response = await apiFetch(`/api/payments/wayforpay/status/${encodeURIComponent(orderReference)}`);
    if (response.ok) {
      const data = await response.json();
      if (data.paid) return data;
      if (data.status === 'declined' || data.status === 'canceled' || data.status === 'error') {
        throw new Error('Payment was not completed.');
      }
    }
    await new Promise((resolve) => { setTimeout(resolve, intervalMs); });
  }
  throw new Error('Payment is still processing. Your plan will update automatically after WayForPay confirms the payment.');
}

export const DEFAULT_WAYFORPAY_CURRENCIES = ['USD', 'EUR', 'UAH'];
