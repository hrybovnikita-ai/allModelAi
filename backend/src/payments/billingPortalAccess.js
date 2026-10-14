/**
 * When AllModelAI may open Stripe Customer Portal (no duplicate checkout).
 */

function isRealStripeCustomerId(customerId) {
    const id = String(customerId || '').trim();
    return id.startsWith('cus_');
}

function isInternalMockBilling(detail) {
    if (!detail) return false;
    const customerId = String(detail.stripeCustomerId || '').trim();
    const subId = String(detail.stripeSubscriptionId || '').trim();
    if (customerId === 'mock_dev_customer') return true;
    if (subId.startsWith('mock_dev_sub')) return true;
    if (subId.startsWith('mock_dev')) return true;
    return false;
}

function analyzeBillingPortalAccess(detail, { hasSubscription = false, active = false } = {}) {
    const provider = String(detail?.paymentProvider || '').trim().toLowerCase() || null;
    const customerId = String(detail?.stripeCustomerId || '').trim();

    if (!hasSubscription || !active) {
        return {
            canManageStripeBilling: false,
            billingManagementCode: 'NO_ACTIVE_SUBSCRIPTION',
            billingManagementMessage: 'You do not have an active paid subscription to manage.',
        };
    }

    if (isInternalMockBilling(detail)) {
        return {
            canManageStripeBilling: false,
            billingManagementCode: 'INTERNAL_DEV_SUBSCRIPTION',
            billingManagementMessage:
                'This Pro plan was activated as a developer or internal test subscription, not through Stripe Checkout. '
                + 'It cannot be changed in the Stripe Customer Portal. Use “End test subscription” if available, or contact support.',
        };
    }

    if (provider === 'wayforpay') {
        return {
            canManageStripeBilling: false,
            billingManagementCode: 'WAYFORPAY_SUBSCRIPTION',
            billingManagementMessage:
                'Your subscription was billed through WayForPay. Manage it via WayForPay or use the in-app test cancel option when applicable.',
        };
    }

    if (isRealStripeCustomerId(customerId)) {
        return {
            canManageStripeBilling: true,
            billingManagementCode: 'STRIPE_PORTAL',
            billingManagementMessage: null,
            stripeCustomerLinked: true,
        };
    }

    if (provider === 'stripe' || detail?.stripeSubscriptionId) {
        return {
            canManageStripeBilling: false,
            billingManagementCode: 'STRIPE_CUSTOMER_MISSING',
            billingManagementMessage:
                'Your plan is active in AllModelAI but is not linked to a Stripe customer record. '
                + 'Complete a Stripe subscription checkout once, or contact support to link billing.',
        };
    }

    return {
        canManageStripeBilling: false,
        billingManagementCode: 'INTERNAL_SUBSCRIPTION_ONLY',
        billingManagementMessage:
            'Your active plan exists only in AllModelAI (no Stripe billing profile). '
            + 'Purchasing again would not open subscription management — use support if you expected Stripe billing.',
    };
}

module.exports = {
    analyzeBillingPortalAccess,
    isInternalMockBilling,
    isRealStripeCustomerId,
};
