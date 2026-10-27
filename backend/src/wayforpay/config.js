const WAYFORPAY_PAY_URL = 'https://secure.wayforpay.com/pay';
const DEFAULT_PRO_BUTTON_URL = 'https://secure.wayforpay.com/button/ba5962ea4be5f';

const envTrim = (name) => String(process.env[name] || '').trim();

/** Server-side secret only — never log or expose. */
const wayforpaySecretKey = () => (
    envTrim('WAYFORPAY_SECRET_KEY')
    || envTrim('WAYFORPAY_MERCHANT_SECRET_KEY')
);

const wayforpayTestModeEnabled = () => process.env.WAYFORPAY_TEST_MODE !== 'false';

const wayforpayMerchantDomain = () => (
    process.env.WAYFORPAY_MERCHANT_DOMAIN?.trim()
    || process.env.WAYFORPAY_DOMAIN?.trim()
    || ''
);

const wayforpayConfigured = () => Boolean(
    envTrim('WAYFORPAY_MERCHANT_ACCOUNT')
    && wayforpaySecretKey()
    && wayforpayMerchantDomain(),
);

/** Checkout UI + mock flow when test mode is on (domain required). Live gateway needs full credentials. */
const wayforpayCheckoutAvailable = () => {
    const domain = wayforpayMerchantDomain();
    if (!domain) return false;
    if (wayforpayTestModeEnabled()) return true;
    return wayforpayConfigured();
};

const { SUPPORTED_CURRENCIES, resolveWayforpayCurrency } = require('./currency');

const wayforpayConfig = () => {
    const currency = resolveWayforpayCurrency(process.env.WAYFORPAY_CURRENCY, 'USD');
    return {
        merchantAccount: envTrim('WAYFORPAY_MERCHANT_ACCOUNT'),
        secretKey: wayforpaySecretKey(),
        merchantDomainName: wayforpayMerchantDomain(),
        currency,
        supportedCurrencies: SUPPORTED_CURRENCIES,
        payUrl: WAYFORPAY_PAY_URL,
        proButtonUrl: envTrim('WAYFORPAY_PRO_BUTTON_URL') || DEFAULT_PRO_BUTTON_URL,
        testMode: wayforpayTestModeEnabled(),
        livePaymentsAllowed: !wayforpayTestModeEnabled() && process.env.WAYFORPAY_LIVE_CONFIRM === 'true',
        usdCheckoutEnabled: currency === 'USD' && SUPPORTED_CURRENCIES.includes('USD'),
    };
};

const backendPublicOrigin = (req) => {
    const explicit = process.env.BACKEND_PUBLIC_URL?.trim() || process.env.BACKEND_ORIGIN?.trim();
    if (explicit) return explicit.replace(/\/$/, '');
    if (process.env.NODE_ENV !== 'production') {
        const port = process.env.PORT || '5050';
        return `http://127.0.0.1:${port}`;
    }
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
    wayforpaySecretKey,
    backendPublicOrigin,
};
