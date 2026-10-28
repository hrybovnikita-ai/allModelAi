const { normalizePlanKey } = require('../billing/plans');

function envTrim(name) {
    return String(process.env[name] || '').trim();
}

function lemonSqueezyConfigurationReport() {
    const missing = [];
    if (!envTrim('LEMONSQUEEZY_API_KEY')) missing.push('LEMONSQUEEZY_API_KEY');
    if (!envTrim('LEMONSQUEEZY_STORE_ID')) missing.push('LEMONSQUEEZY_STORE_ID');
    if (!envTrim('LEMONSQUEEZY_VARIANT_ID')) missing.push('LEMONSQUEEZY_VARIANT_ID');
    const webhookConfigured = Boolean(envTrim('LEMONSQUEEZY_WEBHOOK_SECRET'));
    if (!webhookConfigured) missing.push('LEMONSQUEEZY_WEBHOOK_SECRET');
    const checkoutEnabled = Boolean(
        envTrim('LEMONSQUEEZY_API_KEY')
        && envTrim('LEMONSQUEEZY_STORE_ID')
        && envTrim('LEMONSQUEEZY_VARIANT_ID'),
    );
    return {
        configured: checkoutEnabled && webhookConfigured,
        checkoutEnabled,
        webhookConfigured,
        missing,
        storeId: envTrim('LEMONSQUEEZY_STORE_ID') || null,
        variantId: envTrim('LEMONSQUEEZY_VARIANT_ID') || null,
        planKey: resolveLemonSqueezyPlanKey(),
        priceLabel: envTrim('LEMONSQUEEZY_PRICE_LABEL') || '$20.00',
    };
}

function resolveLemonSqueezyPlanKey() {
    const raw = envTrim('LEMONSQUEEZY_PLAN_KEY') || 'pro';
    const normalized = normalizePlanKey(raw);
    return normalized || 'common';
}

function assertLemonSqueezyCheckoutAllowed() {
    const report = lemonSqueezyConfigurationReport();
    if (!report.checkoutEnabled) {
        return {
            ok: false,
            message: 'Lemon Squeezy checkout is not configured on the server.',
            code: 'LEMONSQUEEZY_NOT_CONFIGURED',
        };
    }
    return { ok: true };
}

function resolveClientUrl(req) {
    const configured = envTrim('CLIENT_URL') || envTrim('FRONTEND_ORIGIN');
    if (configured) {
        const first = configured.split(',')[0].trim().replace(/\/$/, '');
        if (first) return first;
    }
    const origin = req?.get?.('origin');
    if (origin) return String(origin).replace(/\/$/, '');
    return 'http://localhost:5173';
}

function resolveDefaultVariantId() {
    return envTrim('LEMONSQUEEZY_VARIANT_ID');
}

function isAllowedVariantId(variantId) {
    const requested = String(variantId || '').trim();
    const configured = resolveDefaultVariantId();
    if (!requested) return configured;
    return requested === configured;
}

module.exports = {
    lemonSqueezyConfigurationReport,
    assertLemonSqueezyCheckoutAllowed,
    resolveClientUrl,
    resolveDefaultVariantId,
    resolveLemonSqueezyPlanKey,
    isAllowedVariantId,
};
