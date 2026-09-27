const { wayforpayConfigured, wayforpayConfig, wayforpayCheckoutAvailable } = require('../wayforpay/config');

const TEST_MODE_BANNER = 'TEST MODE — NO REAL MONEY WILL BE CHARGED';

const stripeCheckoutEnabled = () => {
    if (!process.env.STRIPE_SECRET_KEY?.trim()) return false;
    if (wayforpayCheckoutAvailable() && process.env.STRIPE_CHECKOUT_WHEN_WAYFORPAY !== 'true') {
        return false;
    }
    return true;
};

const buildCheckoutInfo = () => {
    const stripeOn = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
    const wayforpayOn = wayforpayCheckoutAvailable();
    const primaryProvider = wayforpayOn ? 'wayforpay' : (stripeOn ? 'stripe' : null);
    const wayforpayTestMode = wayforpayOn && wayforpayConfig().testMode;
    const checkoutSecureLabel = primaryProvider === 'wayforpay'
        ? (wayforpayTestMode ? 'WAYFORPAY TEST CHECKOUT' : 'WAYFORPAY SECURE CHECKOUT')
        : primaryProvider === 'stripe'
            ? 'STRIPE SECURE CHECKOUT'
            : 'CHECKOUT';
    return {
        primaryProvider,
        stripeConfigured: stripeOn,
        stripeCheckoutEnabled: stripeCheckoutEnabled(),
        wayforpayConfigured: wayforpayConfigured(),
        wayforpayCheckoutAvailable: wayforpayOn,
        wayforpayTestMode,
        wayforpayMockCheckout: Boolean(wayforpayTestMode),
        checkoutSecureLabel,
        showTestModeBanner: Boolean(wayforpayTestMode),
        testModeBannerText: wayforpayTestMode ? TEST_MODE_BANNER : null,
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
