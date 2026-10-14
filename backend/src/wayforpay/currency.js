const { planAmountDecimal, normalizePlanKey, subscriptionPlans } = require('../billing/plans');

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'UAH'];

const DEFAULT_FX_FROM_USD = {
    USD: 1,
    EUR: 0.92,
    UAH: 41.5,
};

function parseFxRatesFromEnv() {
    const rates = { ...DEFAULT_FX_FROM_USD };
    const raw = String(process.env.WAYFORPAY_FX_RATES || '').trim();
    if (!raw) return rates;
    try {
        const parsed = JSON.parse(raw);
        for (const code of SUPPORTED_CURRENCIES) {
            const value = Number(parsed[code]);
            if (Number.isFinite(value) && value > 0) rates[code] = value;
        }
    } catch {
        /* keep defaults */
    }
    return rates;
}

function resolveWayforpayCurrency(requested, fallback) {
    const base = String(fallback || process.env.WAYFORPAY_CURRENCY || 'USD').trim().toUpperCase();
    const currency = String(requested || base).trim().toUpperCase();
    if (SUPPORTED_CURRENCIES.includes(currency)) return currency;
    if (SUPPORTED_CURRENCIES.includes(base)) return base;
    return 'USD';
}

function convertUsdPlanAmount(usdAmountString, currency) {
    const usd = Number(usdAmountString);
    if (!Number.isFinite(usd) || usd <= 0) return null;
    const rates = parseFxRatesFromEnv();
    const rate = rates[currency] ?? 1;
    const converted = usd * rate;
    if (currency === 'UAH') {
        return String(Math.max(1, Math.round(converted)));
    }
    return converted.toFixed(2);
}

function planAmountForCurrency(planKey, currency) {
    const normalized = normalizePlanKey(planKey);
    const plan = subscriptionPlans[normalized];
    if (!plan?.amount) return null;
    const usd = planAmountDecimal(normalized);
    return convertUsdPlanAmount(usd, currency);
}

function wayforpayLanguageForCurrency(currency) {
    return currency === 'UAH' ? 'UA' : 'EN';
}

module.exports = {
    SUPPORTED_CURRENCIES,
    resolveWayforpayCurrency,
    planAmountForCurrency,
    convertUsdPlanAmount,
    wayforpayLanguageForCurrency,
    parseFxRatesFromEnv,
};
