'use strict';

const { parseEnvBoolean } = require('../platform/featureRegistry');
const { stripeConfigurationReport } = require('./stripeConfig');
const {
    assertStripeCheckoutAllowed,
    getStripeMode,
    getStripeKeyMode,
    isStripeTestMode,
} = require('./stripeMode');
const { resolvePrimaryPaymentProvider } = require('./paymentProvider');
const { wayforpayConfig, wayforpayConfigured } = require('../wayforpay/config');
const { paddleConfigurationReport } = require('./paddleConfig');

const envTrim = (name) => String(process.env[name] || '').trim();

/**
 * Owner-facing checklist for enabling real (live) customer charges.
 * Never returns secret values — names and boolean status only.
 */
function buildLiveActivationReadiness() {
    const stripeConfig = stripeConfigurationReport({ requireWebhook: true });
    const stripeGuard = assertStripeCheckoutAllowed();
    const keyMode = getStripeKeyMode();
    const mode = getStripeMode();
    const liveFlag = parseEnvBoolean('FEATURE_BILLING_LIVE_CHECKOUT', false);
    const creditsLiveFlag = parseEnvBoolean('AI_CREDITS_ALLOW_LIVE_CHECKOUT', false);
    const primary = resolvePrimaryPaymentProvider();
    const wfp = wayforpayConfig();
    const paddle = paddleConfigurationReport();

    const requirements = [
        {
            id: 'stripe_secret',
            label: 'Stripe secret key configured',
            ok: stripeConfig.secretKeyConfigured,
            env: 'STRIPE_SECRET_KEY',
        },
        {
            id: 'stripe_publishable',
            label: 'Stripe publishable key configured',
            ok: stripeConfig.publishableKeyConfigured,
            env: 'STRIPE_PUBLISHABLE_KEY',
        },
        {
            id: 'stripe_webhook',
            label: 'Stripe webhook signing secret configured',
            ok: stripeConfig.webhookConfigured,
            env: 'STRIPE_WEBHOOK_SECRET',
        },
        {
            id: 'stripe_key_mode_known',
            label: 'Stripe key mode is test or live (not unknown)',
            ok: keyMode === 'test' || keyMode === 'live',
            detail: keyMode,
        },
        {
            id: 'stripe_guard',
            label: 'Stripe checkout guard allows current keys',
            ok: stripeGuard.ok,
            detail: stripeGuard.ok ? null : stripeGuard.code,
            message: stripeGuard.ok ? null : stripeGuard.message,
        },
        {
            id: 'live_checkout_flag',
            label: 'FEATURE_BILLING_LIVE_CHECKOUT enabled for live keys',
            ok: keyMode !== 'live' || liveFlag,
            env: 'FEATURE_BILLING_LIVE_CHECKOUT',
            requiredForLive: true,
        },
        {
            id: 'stripe_mode_live',
            label: 'STRIPE_MODE=live when using live keys',
            ok: keyMode !== 'live' || mode === 'live',
            env: 'STRIPE_MODE',
            requiredForLive: true,
        },
        {
            id: 'ai_credits_live_flag',
            label: 'AI_CREDITS_ALLOW_LIVE_CHECKOUT for live credit packs',
            ok: keyMode !== 'live' || creditsLiveFlag || isStripeTestMode(),
            env: 'AI_CREDITS_ALLOW_LIVE_CHECKOUT',
            requiredForLive: true,
        },
        {
            id: 'pro_price_optional',
            label: 'Optional STRIPE_PRICE_PRO_MONTHLY (inline price_data used if unset)',
            ok: true,
            env: 'STRIPE_PRICE_PRO_MONTHLY',
            optional: true,
            configured: Boolean(envTrim('STRIPE_PRICE_PRO_MONTHLY') || envTrim('STRIPE_PRICE_PRO') || envTrim('STRIPE_PRO_PRICE_ID')),
        },
        {
            id: 'terms_privacy',
            label: 'Terms and privacy pages available on the marketing site',
            ok: true,
            optional: true,
            note: 'Confirm /terms and /privacy (or equivalent) are published before live launch.',
        },
        {
            id: 'merchant_kyc',
            label: 'Stripe merchant identity / KYC verified (Dashboard)',
            ok: false,
            optional: false,
            manual: true,
            note: 'Verify in Stripe Dashboard → Settings → Business details / Bank accounts and scheduling. Software cannot confirm bank payout eligibility.',
        },
        {
            id: 'payout_bank',
            label: 'Eligible bank account linked for Stripe payouts',
            ok: false,
            optional: false,
            manual: true,
            note: 'Add and verify a payout bank account in the Stripe Dashboard. Payouts settle only after Stripe approves the account.',
        },
    ];

    const blocking = requirements.filter((r) => !r.ok && !r.optional && !r.manual);
    const manualPending = requirements.filter((r) => r.manual && !r.ok);
    const liveChargesAllowed = keyMode === 'live'
        && liveFlag
        && mode === 'live'
        && stripeGuard.ok
        && stripeConfig.webhookConfigured;

    return {
        primaryProvider: primary,
        stripeMode: mode,
        stripeKeyMode: keyMode,
        testMode: isStripeTestMode(),
        liveCheckoutFlag: liveFlag,
        aiCreditsLiveFlag: creditsLiveFlag,
        liveChargesAllowed,
        liveChargesBlockedReason: liveChargesAllowed
            ? null
            : (blocking[0]?.message
                || blocking[0]?.label
                || (keyMode !== 'live'
                    ? 'Server is using Stripe test credentials — no real card charges.'
                    : 'Live checkout flags or configuration incomplete.')),
        softwareReadyForTestCheckout: stripeConfig.ok && stripeGuard.ok,
        softwareReadyForLiveCheckout: liveChargesAllowed,
        manualVerificationRequired: manualPending.map((r) => ({
            id: r.id,
            label: r.label,
            note: r.note,
        })),
        requirements,
        wayforpay: {
            configured: wayforpayConfigured(),
            testMode: wfp.testMode,
            liveConfirm: envTrim('WAYFORPAY_LIVE_CONFIRM') === 'true',
        },
        paddle: {
            configured: paddle.ok,
            sandbox: paddle.sandbox,
            missing: paddle.missing,
        },
        activationChecklist: [
            'Complete Stripe identity verification (KYC) for the merchant country of registration.',
            'Link an eligible payout bank account in Stripe Dashboard and wait for verification.',
            'Create live Products/Prices (or rely on server price_data) and set STRIPE_PRICE_* env vars if required.',
            'Add live webhook endpoint: POST https://<backend>/api/payments/webhook with STRIPE_WEBHOOK_SECRET.',
            'Set STRIPE_SECRET_KEY=sk_live_…, STRIPE_PUBLISHABLE_KEY=pk_live_…, STRIPE_MODE=live on Render.',
            'Set FEATURE_BILLING_LIVE_CHECKOUT=true only after explicit owner approval.',
            'Set AI_CREDITS_ALLOW_LIVE_CHECKOUT=true if selling live AI credit packs.',
            'Confirm /terms, /privacy, refund and cancellation policies are published.',
            'Run a $1 live smoke charge with a real card, then refund it, before opening public checkout.',
        ],
        generatedAt: new Date().toISOString(),
    };
}

module.exports = {
    buildLiveActivationReadiness,
};
