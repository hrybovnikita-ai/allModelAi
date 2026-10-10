const {
    assertStripeCheckoutAllowed,
    getStripeMode,
    isStripeTestMode,
    stripePriceIdForPlan,
} = require('./stripeMode');
const { stripeUserMessageFromReport } = require('./stripeUserMessages');

const envTrim = (name) => String(process.env[name] || '').trim();

function publishableKeyFromEnv() {
    return envTrim('STRIPE_PUBLISHABLE_KEY') || envTrim('VITE_STRIPE_PUBLISHABLE_KEY');
}

/**
 * Lists env vars that must be set manually (never logs secret values).
 * @param {{ requireWebhook?: boolean, planKey?: string }} [options]
 */
function stripeConfigurationReport(options = {}) {
    const missing = [];
    const warnings = [];

    if (!envTrim('STRIPE_SECRET_KEY')) {
        missing.push('STRIPE_SECRET_KEY');
    }
    if (!publishableKeyFromEnv()) {
        missing.push('STRIPE_PUBLISHABLE_KEY (or VITE_STRIPE_PUBLISHABLE_KEY on Render for /api/payments/config)');
    }
    if (options.requireWebhook && !envTrim('STRIPE_WEBHOOK_SECRET')) {
        missing.push('STRIPE_WEBHOOK_SECRET');
    }

    const guard = assertStripeCheckoutAllowed();
    if (!guard.ok && guard.code !== 'STRIPE_NOT_CONFIGURED') {
        warnings.push(guard.message);
    }

    const planKey = options.planKey;
    if (planKey && isStripeTestMode() === false && envTrim('STRIPE_REQUIRE_PRICE_IDS') === 'true') {
        if (!stripePriceIdForPlan(planKey)) {
            missing.push(planKey.includes('plus') || planKey.includes('enterprise')
                ? 'STRIPE_ENTERPRISE_PRICE_ID'
                : 'STRIPE_PRO_PRICE_ID');
        }
    }

    const ok = missing.length === 0 && guard.ok;
    let message = null;
    if (!ok) {
        if (missing.length) {
            message = `Configure on the server: ${missing.join(', ')}.`;
        } else {
            message = guard.message;
        }
    }

    return {
        ok,
        missing,
        warnings,
        message,
        userMessage: stripeUserMessageFromReport({
            ok,
            code: guard.code || (missing.length ? 'STRIPE_INCOMPLETE_CONFIG' : null),
        }),
        code: guard.code || (missing.length ? 'STRIPE_INCOMPLETE_CONFIG' : null),
        mode: getStripeMode(),
        testMode: isStripeTestMode(),
        publishableKeyConfigured: Boolean(publishableKeyFromEnv()),
        secretKeyConfigured: Boolean(envTrim('STRIPE_SECRET_KEY')),
        webhookConfigured: Boolean(envTrim('STRIPE_WEBHOOK_SECRET')),
    };
}

module.exports = {
    publishableKeyFromEnv,
    stripeConfigurationReport,
};
