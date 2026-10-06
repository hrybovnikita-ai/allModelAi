const { wayforpayConfigured, wayforpayConfig, wayforpayCheckoutAvailable } = require('../wayforpay/config');
const {
    assertStripeCheckoutAllowed,
    getStripeMode,
    isStripeTestMode,
    shouldPreferStripeOverWayforpay,
} = require('./stripeMode');

const TEST_MODE_BANNER = 'TEST MODE — NO REAL MONEY WILL BE CHARGED';

const stripeCheckoutEnabled = () => {
    if (!assertStripeCheckoutAllowed().ok) return false;
    const wayforpayOn = wayforpayCheckoutAvailable();
    if (wayforpayOn && !shouldPreferStripeOverWayforpay()) return false;
    return true;
};

const buildCheckoutInfo = () => {
    const stripeKeyPresent = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
    const stripeGuard = assertStripeCheckoutAllowed();
    const stripeOn = stripeKeyPresent && stripeGuard.ok;
    const wayforpayOn = wayforpayCheckoutAvailable();
    const preferStripe = shouldPreferStripeOverWayforpay();
    const primaryProvider = stripeOn && (preferStripe || !wayforpayOn)
        ? 'stripe'
        : wayforpayOn
            ? 'wayforpay'
            : stripeOn
                ? 'stripe'
                : null;
    const wayforpayTestMode = wayforpayOn && wayforpayConfig().testMode;
    const stripeTestMode = stripeOn && isStripeTestMode();
    const checkoutSecureLabel = primaryProvider === 'wayforpay'
        ? (wayforpayTestMode ? 'WAYFORPAY TEST CHECKOUT' : 'WAYFORPAY SECURE CHECKOUT')
        : primaryProvider === 'stripe'
            ? (stripeTestMode ? 'STRIPE TEST CHECKOUT' : 'STRIPE SECURE CHECKOUT')
            : 'CHECKOUT';
    return {
        primaryProvider,
        stripeConfigured: stripeKeyPresent,
        stripeCheckoutEnabled: stripeCheckoutEnabled(),
        stripeMode: getStripeMode(),
        stripeTestMode,
        stripeCheckoutBlocked: stripeKeyPresent && !stripeGuard.ok,
        stripeCheckoutBlockedMessage: stripeGuard.ok ? null : stripeGuard.message,
        wayforpayConfigured: wayforpayConfigured(),
        wayforpayCheckoutAvailable: wayforpayOn,
        wayforpayTestMode,
        wayforpayMockCheckout: Boolean(wayforpayTestMode && primaryProvider === 'wayforpay'),
        checkoutSecureLabel,
        showTestModeBanner: Boolean(stripeTestMode || wayforpayTestMode),
        testModeBannerText: (stripeTestMode || wayforpayTestMode) ? TEST_MODE_BANNER : null,
        showStripeTestCardHint: Boolean(stripeTestMode && primaryProvider === 'stripe'),
    };
};

const assertWayforpayCheckoutAllowed = () => {
    const cfg = wayforpayConfig();
    if (cfg.testMode) return null;
    if (!wayforpayConfigured()) {
        return 'WayForPay live checkout requires WAYFORPAY_MERCHANT_ACCOUNT, WAYFORPAY_SECRET_KEY, and WAYFORPAY_DOMAIN.';
    }
    if (process.env.WAYFORPAY_LIVE_CONFIRM === 'true') return null;
    return 'Live WayForPay charges are disabled. Set WAYFORPAY_TEST_MODE=true for mock testing or WAYFORPAY_LIVE_CONFIRM=true for production.';
};

module.exports = {
    buildCheckoutInfo,
    stripeCheckoutEnabled,
    assertWayforpayCheckoutAllowed,
    TEST_MODE_BANNER,
};
