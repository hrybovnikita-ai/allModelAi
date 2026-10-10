/** Map API payment errors to user-friendly copy (no env var names). */

const DEFAULT_MSG = 'Secure checkout is temporarily unavailable. Please try again later.';

export function formatPaymentError(data, fallback = DEFAULT_MSG) {
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (data.userMessage) return data.userMessage;
  if (data.checkoutUnavailableMessage) return data.checkoutUnavailableMessage;
  const msg = data.message || fallback;
  if (/STRIPE_|VITE_|WEBHOOK|missingEnvVars|Configure on the server/i.test(msg)) {
    return DEFAULT_MSG;
  }
  if (Array.isArray(data.missingEnvVars) && data.missingEnvVars.length) {
    return DEFAULT_MSG;
  }
  return msg;
}
