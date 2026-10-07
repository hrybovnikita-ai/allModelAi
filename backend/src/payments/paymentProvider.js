const { wayforpayCheckoutAvailable, wayforpayConfig } = require('../wayforpay/config');
const { assertStripeCheckoutAllowed, getStripeMode, isStripeTestMode } = require('./stripeMode');

const envTrim = (name) => String(process.env[name] || '').trim();

/** @returns {'test'|'live'} */
function getPaymentMode() {
    const explicit = envTrim('PAYMENT_MODE').toLowerCase();
    if (explicit === 'live' || explicit === 'test') return explicit;
    const wfpTest = wayforpayCheckoutAvailable() && wayforpayConfig().testMode;
    const stripeGuard = assertStripeCheckoutAllowed();
    const stripeTest = stripeGuard.ok && isStripeTestMode();
    if (wfpTest || stripeTest || getStripeMode() === 'test') return 'test';
    return 'live';
}

function stripePaymentsConfigured() {
    return assertStripeCheckoutAllowed().ok;
}

function shouldPreferStripeOverWayforpay() {
    const provider = envTrim('PAYMENT_PROVIDER').toLowerCase();
    if (provider === 'stripe') return true;
    if (provider === 'wayforpay') return false;
    return envTrim('STRIPE_CHECKOUT_WHEN_WAYFORPAY') === 'true';
}

function resolvePrimaryPaymentProvider() {
    const forced = envTrim('PAYMENT_PROVIDER').toLowerCase();
    const wfp = wayforpayCheckoutAvailable();
    const stripeOn = stripePaymentsConfigured();

    if (forced === 'wayforpay') return wfp ? 'wayforpay' : null;
    if (forced === 'stripe') return stripeOn ? 'stripe' : null;

    if (wfp && !shouldPreferStripeOverWayforpay()) return 'wayforpay';
    if (stripeOn) return 'stripe';
    if (wfp) return 'wayforpay';
    return null;
}

function stripeCheckoutEnabledForDeployment() {
    if (!stripePaymentsConfigured()) return false;
    const primary = resolvePrimaryPaymentProvider();
    return primary === 'stripe';
}

function wayforpayCheckoutEnabledForDeployment() {
    if (!wayforpayCheckoutAvailable()) return false;
    return resolvePrimaryPaymentProvider() === 'wayforpay';
}

function paymentsCheckoutAvailable() {
    return Boolean(resolvePrimaryPaymentProvider());
}

module.exports = {
    getPaymentMode,
    resolvePrimaryPaymentProvider,
    shouldPreferStripeOverWayforpay,
    stripeCheckoutEnabledForDeployment,
    wayforpayCheckoutEnabledForDeployment,
    paymentsCheckoutAvailable,
    stripePaymentsConfigured,
};
