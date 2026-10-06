import { nativeClientHeaders, resolveApiUrl } from './apiBase.js';
import { parseJsonResponse } from './httpJson.js';

const TEST_MODE_BANNER = 'TEST MODE — NO REAL MONEY WILL BE CHARGED';

/** Mirrors backend WAYFORPAY_TEST_MODE for local UI when checkout-info is unavailable. */
export function clientWayforpayTestModeEnabled() {
  const flag = import.meta.env.VITE_WAYFORPAY_TEST_MODE;
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  return import.meta.env.DEV;
}

export function buildClientTestCheckoutInfo() {
  const pk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
  const stripeTestPk = pk.startsWith('pk_test_');
  if (stripeTestPk) {
    return {
      primaryProvider: 'stripe',
      stripeConfigured: true,
      stripeCheckoutEnabled: true,
      stripeTestMode: true,
      showTestModeBanner: true,
      showStripeTestCardHint: true,
      testModeBannerText: TEST_MODE_BANNER,
      checkoutSecureLabel: 'STRIPE TEST CHECKOUT',
      fromClientFallback: true,
    };
  }
  const testMode = clientWayforpayTestModeEnabled();
  if (!testMode) return null;
  return {
    primaryProvider: 'wayforpay',
    wayforpayCheckoutAvailable: true,
    wayforpayTestMode: true,
    wayforpayMockCheckout: true,
    showTestModeBanner: true,
    testModeBannerText: TEST_MODE_BANNER,
    checkoutSecureLabel: 'WAYFORPAY TEST CHECKOUT',
    fromClientFallback: true,
  };
}

export function mergeCheckoutInfo(apiInfo) {
  const fallback = buildClientTestCheckoutInfo();
  if (!apiInfo) return fallback;
  if (apiInfo.primaryProvider === 'stripe' || apiInfo.stripeTestMode || apiInfo.showTestModeBanner) return apiInfo;
  if (fallback && apiInfo.primaryProvider !== 'stripe') {
    return { ...fallback, ...apiInfo, ...fallback };
  }
  return apiInfo;
}

export async function fetchCheckoutInfo() {
  try {
    const response = await fetch(resolveApiUrl('/api/payments/checkout-info'), {
      credentials: 'include',
      headers: { Accept: 'application/json', ...nativeClientHeaders() },
    });
    if (!response.ok) return buildClientTestCheckoutInfo();
    return mergeCheckoutInfo(await parseJsonResponse(response));
  } catch {
    return buildClientTestCheckoutInfo();
  }
}

export { TEST_MODE_BANNER };
