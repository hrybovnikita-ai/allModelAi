/**
 * POST redirect to WayForPay hosted checkout (merchantSignature is prepared on the server).
 */
export function submitWayforpayCheckout({ payUrl, fields }) {
  const testBlock = import.meta.env.VITE_WAYFORPAY_TEST_MODE !== 'false'
    && (import.meta.env.VITE_WAYFORPAY_TEST_MODE === 'true' || import.meta.env.DEV);
  if (testBlock) {
    throw new Error('Test mode: real WayForPay checkout is blocked. Use Complete test payment.');
  }
  if (!payUrl || !fields) {
    throw new Error('WayForPay checkout payload is incomplete.');
  }
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = payUrl;
  form.acceptCharset = 'UTF-8';
  form.style.display = 'none';

  const appendField = (name, value) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  };

  Object.entries(fields).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => appendField(`${key}[]`, item));
    } else {
      appendField(key, value);
    }
  });

  document.body.appendChild(form);
  form.submit();
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
