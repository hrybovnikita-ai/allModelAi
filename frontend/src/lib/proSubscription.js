/** Backend plan slug for Pro (maps to `common` in billing/plans.js). */
export const PRO_SUBSCRIPTION_PLAN_KEY = 'pro';

export const PRO_SUBSCRIPTION_TITLE = 'AllModelAI Pro Subscription';

export const PRO_SUBSCRIPTION_PRICE_LABEL = '$9.99';

export const PRO_SUBSCRIPTION_PRICE_SUFFIX = ' USD / month';

/**
 * Merchant-hosted button URL (marketing). Fulfillment uses POST /api/payments/wayforpay/create
 * so each order is tied to the signed-in user — never grant access from this link alone.
 */
export const WAYFORPAY_MERCHANT_PRO_BUTTON_URL = 'https://secure.wayforpay.com/button/ba5962ea4be5f';
