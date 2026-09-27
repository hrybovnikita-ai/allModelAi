const WAYFORPAY_PAY_URL = 'https://secure.wayforpay.com/pay';

const wayforpayTestModeEnabled = () => process.env.WAYFORPAY_TEST_MODE !== 'false';

const wayforpayMerchantDomain = () => (
    process.env.WAYFORPAY_MERCHANT_DOMAIN?.trim()
    || process.env.WAYFORPAY_DOMAIN?.trim()
    || ''
);

const wayforpayConfigured = () => Boolean(
    process.env.WAYFORPAY_MERCHANT_ACCOUNT?.trim()
    && process.env.WAYFORPAY_SECRET_KEY?.trim()
    && wayforpayMerchantDomain(),
);

/** Checkout UI + mock flow when test mode is on (domain required). Live gateway needs full credentials. */
const wayforpayCheckoutAvailable = () => {
    const domain = wayforpayMerchantDomain();
    if (!domain) return false;
    if (wayforpayTestModeEnabled()) return true;
    return wayforpayConfigured();
};

const wayforpayConfig = () => ({
    merchantAccount: process.env.WAYFORPAY_MERCHANT_ACCOUNT?.trim() || '',
    secretKey: process.env.WAYFORPAY_SECRET_KEY?.trim() || '',
    merchantDomainName: wayforpayMerchantDomain(),
    currency: (process.env.WAYFORPAY_CURRENCY || 'USD').trim().toUpperCase(),
    payUrl: WAYFORPAY_PAY_URL,
    testMode: wayforpayTestModeEnabled(),
    livePaymentsAllowed: !wayforpayTestModeEnabled() && process.env.WAYFORPAY_LIVE_CONFIRM === 'true',
});

const backendPublicOrigin = (req) => {
    const explicit = process.env.BACKEND_PUBLIC_URL?.trim() || process.env.BACKEND_ORIGIN?.trim();
    if (explicit) return explicit.replace(/\/$/, '');
    if (req) {
        const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
        const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
        if (host) return `${proto}://${host}`;
    }
    return '';
};

module.exports = {
    WAYFORPAY_PAY_URL,
    wayforpayTestModeEnabled,
    wayforpayConfigured,
    wayforpayCheckoutAvailable,
    wayforpayConfig,
    backendPublicOrigin,
};
