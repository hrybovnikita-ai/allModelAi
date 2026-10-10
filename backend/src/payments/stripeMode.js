const envTrim = (name) => String(process.env[name] || '').trim();

function secretKey() {
    return envTrim('STRIPE_SECRET_KEY');
}

function publishableKey() {
    return envTrim('STRIPE_PUBLISHABLE_KEY') || envTrim('VITE_STRIPE_PUBLISHABLE_KEY');
}

/** @returns {'test'|'live'|'unknown'} */
function getStripeKeyMode() {
    const sk = secretKey();
    if (sk.startsWith('sk_test_')) return 'test';
    if (sk.startsWith('sk_live_')) return 'live';
    return 'unknown';
}

/** @returns {'test'|'live'|'unknown'} */
function getPublishableKeyMode() {
    const pk = publishableKey();
    if (pk.startsWith('pk_test_')) return 'test';
    if (pk.startsWith('pk_live_')) return 'live';
    return 'unknown';
}

/** Effective mode: STRIPE_MODE env overrides inferred key mode. */
function getStripeMode() {
    const explicit = envTrim('STRIPE_MODE').toLowerCase();
    if (explicit === 'test' || explicit === 'live') return explicit;
    const fromSecret = getStripeKeyMode();
    if (fromSecret === 'test' || fromSecret === 'live') return fromSecret;
    return 'unknown';
}

function isStripeTestMode() {
    return getStripeMode() === 'test';
}

function isDevelopmentLike() {
    return process.env.NODE_ENV !== 'production' || envTrim('STRIPE_ALLOW_LIVE_IN_PRODUCTION') !== 'true';
}

/**
 * Guard before creating charges. Never logs secrets.
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
function assertStripeCheckoutAllowed() {
    const sk = secretKey();
    if (!sk) {
        return {
            ok: false,
            code: 'STRIPE_NOT_CONFIGURED',
            message: 'Stripe is not configured. Add STRIPE_SECRET_KEY to the server environment.',
        };
    }

    const mode = getStripeMode();
    const keyMode = getStripeKeyMode();

    if (mode === 'test' && keyMode === 'live') {
        return {
            ok: false,
            code: 'STRIPE_LIVE_KEY_BLOCKED',
            message: 'STRIPE_MODE=test but a live Stripe secret key is configured. Use sk_test_ keys only for development.',
        };
    }

    if (keyMode === 'live' && isDevelopmentLike() && mode !== 'live') {
        return {
            ok: false,
            code: 'STRIPE_LIVE_KEY_BLOCKED',
            message: 'Live Stripe secret keys are blocked outside production. Set STRIPE_MODE=test and use sk_test_ keys.',
        };
    }

    if (keyMode === 'unknown') {
        return {
            ok: false,
            code: 'STRIPE_KEY_INVALID',
            message: 'STRIPE_SECRET_KEY must be a test key (sk_test_…) or live key (sk_live_…).',
        };
    }

    const pk = publishableKey();
    if (pk) {
        const pkMode = getPublishableKeyMode();
        if (pkMode !== 'unknown' && pkMode !== keyMode) {
            return {
                ok: false,
                code: 'STRIPE_KEY_MISMATCH',
                message: 'Stripe publishable and secret keys must both be test keys or both be live keys.',
            };
        }
        if (mode === 'test' && pkMode === 'live') {
            return {
                ok: false,
                code: 'STRIPE_LIVE_KEY_BLOCKED',
                message: 'STRIPE_MODE=test but a live Stripe publishable key is configured. Use pk_test_ only.',
            };
        }
    }

    return { ok: true };
}

function shouldPreferStripeOverWayforpay() {
    const provider = envTrim('PAYMENT_PROVIDER').toLowerCase();
    if (provider === 'stripe') return true;
    if (provider === 'wayforpay') return false;
    return envTrim('STRIPE_CHECKOUT_WHEN_WAYFORPAY') === 'true';
}

function stripePriceIdForPlan(planKey) {
    const key = String(planKey || '').toLowerCase();
    if (key === 'starter') {
        return envTrim('STRIPE_PRICE_STARTER') || envTrim('STRIPE_STARTER_PRICE_ID');
    }
    if (key === 'common' || key === 'pro') {
        return envTrim('STRIPE_PRICE_PRO') || envTrim('STRIPE_PRO_PRICE_ID');
    }
    if (key === 'plus' || key === 'power' || key === 'enterprise' || key === 'unlimited') {
        return envTrim('STRIPE_PRICE_UNLIMITED')
            || envTrim('STRIPE_ENTERPRISE_PRICE_ID')
            || envTrim('STRIPE_PRICE_ENTERPRISE')
            || envTrim('STRIPE_PRICE_PLUS');
    }
    if (key === 'week') return envTrim('STRIPE_WEEKLY_PRICE_ID') || envTrim('STRIPE_PRICE_WEEK');
    return '';
}

module.exports = {
    assertStripeCheckoutAllowed,
    getStripeMode,
    getStripeKeyMode,
    isStripeTestMode,
    shouldPreferStripeOverWayforpay,
    stripePriceIdForPlan,
};
