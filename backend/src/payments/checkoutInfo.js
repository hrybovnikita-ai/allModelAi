const { wayforpayConfigured, wayforpayConfig, wayforpayCheckoutAvailable } = require('../wayforpay/config');
const { assertStripeCheckoutAllowed, getStripeMode, isStripeTestMode } = require('./stripeMode');
const {
    getPaymentMode,
    resolvePrimaryPaymentProvider,
    paymentsCheckoutAvailable,
    stripeCheckoutEnabledForDeployment,
    wayforpayCheckoutEnabledForDeployment,
    paddleCheckoutEnabledForDeployment,
    listAvailableCheckoutProviders,
    stripePaymentsConfigured,
} = require('./paymentProvider');
const { stripeConfigurationReport } = require('./stripeConfig');
const { paddleConfigurationReport, isPaddleSandbox } = require('./paddleConfig');

const TEST_MODE_BANNER = 'Stripe Test Mode — No real charges';
const PADDLE_SANDBOX_BANNER = 'Paddle Sandbox — No real charges';

const buildCheckoutInfo = () => {
    const stripeGuard = assertStripeCheckoutAllowed();
    const stripeConfig = stripeConfigurationReport();
    const stripeKeyPresent = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
    const stripeOn = stripePaymentsConfigured();
    const wayforpayOn = wayforpayCheckoutAvailable();
    const primaryProvider = resolvePrimaryPaymentProvider();
    const paymentMode = getPaymentMode();
    const paddleReport = paddleConfigurationReport();
    const paddleOn = paddleCheckoutEnabledForDeployment();
    const checkoutProviders = listAvailableCheckoutProviders();
    const wayforpayTestMode = wayforpayOn && wayforpayConfig().testMode;
    const stripeTestMode = stripeOn && isStripeTestMode();
    const paddleSandbox = paddleReport.sandbox || isPaddleSandbox();
    const sandboxDeployment = paymentMode === 'test' || wayforpayTestMode || stripeTestMode || (paddleOn && paddleSandbox);
    const liveWayforpayReady = wayforpayOn && !wayforpayTestMode && wayforpayConfigured()
        && process.env.WAYFORPAY_LIVE_CONFIRM === 'true';
    const showTestModeBanner = sandboxDeployment && !liveWayforpayReady;

    const providerDisplayName = primaryProvider === 'wayforpay'
        ? 'WayForPay'
        : primaryProvider === 'stripe'
            ? 'Stripe'
            : primaryProvider === 'paddle'
                ? 'Paddle'
                : null;

    let checkoutUnavailableMessage = null;
    if (!paymentsCheckoutAvailable()) {
        checkoutUnavailableMessage = process.env.NODE_ENV === 'production'
            ? 'Payments are temporarily unavailable. Please try again later.'
            : 'Payments are not configured. Add Stripe, Paddle, or WayForPay credentials on the server.';
    } else if (primaryProvider === 'stripe' && stripeKeyPresent && !stripeGuard.ok) {
        checkoutUnavailableMessage = stripeGuard.message;
    } else if (primaryProvider === 'stripe' && !stripeConfig.ok) {
        checkoutUnavailableMessage = stripeConfig.message || checkoutUnavailableMessage;
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
        stripeConfiguration: {
            ok: stripeConfig.ok,
            missingEnvVars: stripeConfig.missing,
            testMode: stripeConfig.testMode,
            webhookConfigured: stripeConfig.webhookConfigured,
        },
        wayforpayConfigured: wayforpayConfigured(),
        wayforpayCheckoutAvailable: wayforpayOn,
        wayforpayCheckoutEnabled: wayforpayCheckoutEnabledForDeployment(),
        wayforpayTestMode,
        wayforpayMockCheckout: wayforpayTestMode,
        recurringBillingSupported: primaryProvider === 'stripe' || primaryProvider === 'paddle',
        renewalNotice: primaryProvider === 'stripe'
            ? 'Subscriptions renew automatically each billing period until you cancel in the billing portal.'
            : primaryProvider === 'paddle'
                ? 'Paddle subscriptions renew automatically each billing period until you cancel in the Paddle customer portal.'
                : 'Each successful payment grants one month of access. Automatic card renewal is not enabled yet — renew manually before your period ends unless we enable WayForPay recurring billing.',
        wayforpaySupportedCurrencies: wayforpayOn ? wayforpayConfig().supportedCurrencies : [],
        wayforpayDefaultCurrency: wayforpayOn ? wayforpayConfig().currency : null,
        supportedPaymentMethodsNote: primaryProvider === 'wayforpay'
            ? 'Visa, MasterCard, Google Pay, and Apple Pay through WayForPay secure checkout.'
            : primaryProvider === 'stripe'
                ? 'Cards and wallets supported by Stripe.'
                : primaryProvider === 'paddle'
                    ? 'Cards and wallets supported by Paddle secure checkout.'
                    : null,
        checkoutProviders,
        paddleConfigured: paddleReport.ok,
        paddleCheckoutEnabled: paddleOn,
        paddleSandbox,
        paddleSetupInstructions: paddleReport.setupInstructions,
        paddleMissingEnvVars: paddleReport.missing,
        showTestModeBanner,
        testModeBannerText: showTestModeBanner
            ? (primaryProvider === 'paddle' && paddleSandbox ? PADDLE_SANDBOX_BANNER : TEST_MODE_BANNER)
            : null,
        showStripeTestCardHint: Boolean(primaryProvider === 'stripe' && stripeTestMode),
        showPaddleSandboxHint: Boolean(paddleOn && paddleSandbox),
        secureCheckoutLabel: showTestModeBanner ? 'Secure test checkout' : 'Secure payment',
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
