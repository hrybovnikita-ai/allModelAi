import apiClient from './apiClient';

export { subscriptionMatchesCheckoutPlan } from './stripeSubscriptionPlanMatch';

export async function openStripeBillingPortal() {
  const response = await apiClient.post('/api/payments/billing-portal');
  const url = response.data?.url;
  if (!url) {
    const message = response.data?.userMessage || response.data?.message || 'Could not open billing portal.';
    throw new Error(message);
  }
  window.location.assign(url);
}

export async function openStripeBillingPortalFromApiError(requestError) {
  const data = requestError?.response?.data;
  if (requestError?.response?.status !== 409 || !data?.useBillingPortal) {
    return { redirected: false };
  }
  try {
    await openStripeBillingPortal();
    return { redirected: true };
  } catch (portalError) {
    const portalData = portalError?.response?.data;
    const message = portalData?.userMessage
      || portalData?.message
      || portalError.message
      || data.userMessage
      || data.message;
    return {
      redirected: false,
      message,
      billingManagementCode: portalData?.code || data.code,
    };
  }
}
