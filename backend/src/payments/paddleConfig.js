const { normalizePlanKey } = require('../billing/plans');

const envTrim = (name) => String(process.env[name] || '').trim();

function paddleEnvironmentName() {
    const raw = envTrim('PADDLE_ENV').toLowerCase();
    if (raw === 'live' || raw === 'production') return 'live';
    return 'sandbox';
}

function isPaddleSandbox() {
    return paddleEnvironmentName() === 'sandbox';
}

const PRICE_ENV_BY_PLAN = {
    starter: ['PADDLE_PRICE_STARTER'],
    common: ['PADDLE_PRICE_PRO', 'PADDLE_PRICE_COMMON'],
    plus: ['PADDLE_PRICE_UNLIMITED', 'PADDLE_PRICE_PLUS', 'PADDLE_PRICE_ENTERPRISE'],
};

function resolvePaddlePriceId(planKey) {
    const key = normalizePlanKey(planKey);
    const envNames = PRICE_ENV_BY_PLAN[key];
    if (!envNames) return null;
    for (const name of envNames) {
        const value = envTrim(name);
        if (value) return value;
    }
    return null;
}

function paddleConfigurationReport() {
    const missing = [];
    if (!envTrim('PADDLE_API_KEY')) missing.push('PADDLE_API_KEY');
    if (!envTrim('PADDLE_CLIENT_TOKEN')) missing.push('PADDLE_CLIENT_TOKEN');
    if (!envTrim('PADDLE_WEBHOOK_SECRET')) missing.push('PADDLE_WEBHOOK_SECRET');

    const pricePlans = ['starter', 'common', 'plus'];
    const missingPrices = pricePlans.filter((planKey) => !resolvePaddlePriceId(planKey));
    for (const planKey of missingPrices) {
        const label = planKey === 'common' ? 'PRO' : planKey === 'plus' ? 'UNLIMITED' : planKey.toUpperCase();
        missing.push(`PADDLE_PRICE_${label} (or alias)`);
    }

    const ok = missing.length === 0;
    return {
        ok,
        missing,
        sandbox: isPaddleSandbox(),
        environment: paddleEnvironmentName(),
        webhookConfigured: Boolean(envTrim('PADDLE_WEBHOOK_SECRET')),
        userMessage: ok
            ? null
            : 'Paddle sandbox is not fully configured on the server. Add API key, client token, webhook secret, and price IDs in Render.',
        setupInstructions: ok
            ? null
            : [
                'Paddle Dashboard (Sandbox): Catalog → create products/prices for Starter, Pro, Unlimited.',
                'Developer Tools → Authentication: copy API key and client-side token.',
                'Developer Tools → Notifications: destination URL https://YOUR-RENDER-HOST/api/payments/paddle/webhook',
                'Set PADDLE_ENV=sandbox, PADDLE_API_KEY, PADDLE_CLIENT_TOKEN, PADDLE_WEBHOOK_SECRET, and PADDLE_PRICE_* on Render.',
                'Never put PADDLE_API_KEY or PADDLE_WEBHOOK_SECRET in Vercel — backend only.',
            ].join(' '),
    };
}

function assertPaddleCheckoutAllowed() {
    const report = paddleConfigurationReport();
    if (!envTrim('PADDLE_API_KEY')) {
        return {
            ok: false,
            code: 'PADDLE_NOT_CONFIGURED',
            message: 'Paddle Billing is not configured.',
            report,
        };
    }
    if (!isPaddleSandbox() && envTrim('PADDLE_ALLOW_LIVE') !== 'true') {
        return {
            ok: false,
            code: 'PADDLE_LIVE_DISABLED',
            message: 'Paddle live billing is disabled. Use PADDLE_ENV=sandbox or set PADDLE_ALLOW_LIVE=true after explicit approval.',
            report,
        };
    }
    if (!report.ok) {
        return {
            ok: false,
            code: 'PADDLE_INCOMPLETE_CONFIG',
            message: report.userMessage,
            report,
        };
    }
    return { ok: true, report };
}

function paddlePaymentsConfigured() {
    return Boolean(envTrim('PADDLE_API_KEY') && envTrim('PADDLE_CLIENT_TOKEN'));
}

function paddleCheckoutEnabledForDeployment() {
    if (!paddlePaymentsConfigured()) return false;
    const guard = assertPaddleCheckoutAllowed();
    return guard.ok;
}

module.exports = {
    paddleEnvironmentName,
    isPaddleSandbox,
    resolvePaddlePriceId,
    paddleConfigurationReport,
    assertPaddleCheckoutAllowed,
    paddlePaymentsConfigured,
    paddleCheckoutEnabledForDeployment,
    clientTokenFromEnv: () => envTrim('PADDLE_CLIENT_TOKEN') || null,
};
