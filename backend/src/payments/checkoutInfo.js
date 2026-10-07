const { wayforpayConfigured, wayforpayConfig, wayforpayCheckoutAvailable } = require('../wayforpay/config');
const { assertStripeCheckoutAllowed, getStripeMode, isStripeTestMode } = require('./stripeMode');
const {
    getPaymentMode,
    resolvePrimaryPaymentProvider,
    paymentsCheckoutAvailable,
    stripeCheckoutEnabledForDeployment,
    wayforpayCheckoutEnabledForDeployment,
    stripePaymentsConfigured,
} = require('./paymentProvider');

const TEST_MODE_BANNER = 'TEST MODE — No real money will be charged';

const buildCheckoutInfo = () => {
    const stripeGuard = assertStripeCheckoutAllowed();
    const stripeKeyPresent = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
    const stripeOn = stripePaymentsConfigured();
    const wayforpayOn = wayforpayCheckoutAvailable();
    const primaryProvider = resolvePrimaryPaymentProvider();
    const paymentMode = getPaymentMode();
    const wayforpayTestMode = wayforpayOn && wayforpayConfig().testMode;
    const stripeTestMode = stripeOn && isStripeTestMode();
    const testModeActive = paymentMode === 'test' || wayforpayTestMode || stripeTestMode;

    const providerDisplayName = primaryProvider === 'wayforpay'
        ? 'WayForPay'
        : primaryProvider === 'stripe'
            ? 'Stripe'
            : null;

    let checkoutUnavailableMessage = null;
    if (!paymentsCheckoutAvailable()) {
        checkoutUnavailableMessage = process.env.NODE_ENV === 'production'
            ? 'Payments are temporarily unavailable. Please try again later.'
            : 'Payments are not configured. Add WayForPay or Stripe credentials on the server.';
    } else if (primaryProvider === 'stripe' && stripeKeyPresent && !stripeGuard.ok) {
        checkoutUnavailableMessage = stripeGuard.message;
    }

    return {
        paymentMode,
        primaryProvider,
        paymentProvider: primaryProvider,
        providerDisplayName,
        checkoutAvailable: paymentsCheckoutAvailable() && !checkoutUnavailableMessage,
        checkoutUnavailableMessage,
        stripeConfigured: stripeKeyPresent,
        stripeCheckoutEnabled: stripeCheckoutEnabledForDeployment(),
        stripeMode: getStripeMode(),
        stripeTestMode,
        stripeCheckoutBlocked: stripeKeyPresent && !stripeGuard.ok,
        stripeCheckoutBlockedMessage: stripeGuard.ok ? null : stripeGuard.message,
        wayforpayConfigured: wayforpayConfigured(),
        wayforpayCheckoutAvailable: wayforpayOn,
        wayforpayCheckoutEnabled: wayforpayCheckoutEnabledForDeployment(),
        wayforpayTestMode,
        wayforpayMockCheckout: Boolean(primaryProvider === 'wayforpay' && wayforpayTestMode),
        showTestModeBanner: testModeActive,
        testModeBannerText: testModeActive ? TEST_MODE_BANNER : null,
        showStripeTestCardHint: Boolean(primaryProvider === 'stripe' && stripeTestMode),
        secureCheckoutLabel: testModeActive ? 'Secure test checkout' : 'Secure payment',
    };
};

const assertWayforpayCheckoutAllowed = () => {
    const cfg = wayforpayConfig();
    if (cfg.testMode) return null;
    if (!wayforpayConfigured()) {
        return 'WayForPay live checkout requires merchant account, secret key, and domain on the server.';
    }
    if (process.env.WAYFORPAY_LIVE_CONFIRM === 'true') return null;
    return 'Live WayForPay charges are disabled until live mode is explicitly enabled on the server.';
};

const stripeCheckoutEnabled = () => stripeCheckoutEnabledForDeployment();

module.exports = {
    buildCheckoutInfo,
    stripeCheckoutEnabled,
    assertWayforpayCheckoutAllowed,
    TEST_MODE_BANNER,
};
