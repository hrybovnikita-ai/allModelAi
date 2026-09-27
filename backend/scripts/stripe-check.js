#!/usr/bin/env node
const path = require('node:path');

try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

const secret = process.env.STRIPE_SECRET_KEY?.trim();
const publishable = process.env.STRIPE_PUBLISHABLE_KEY?.trim()
    || process.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim();

const fail = (message) => {
    console.error(message);
    process.exit(1);
};

if (!secret) {
    fail(
        'STRIPE_SECRET_KEY is missing in backend/.env\n'
        + 'Get test keys: https://dashboard.stripe.com/test/apikeys',
    );
}

if (!publishable) {
    console.warn('Warning: STRIPE_PUBLISHABLE_KEY is not set (embedded checkout needs it).');
}

(async () => {
    const Stripe = require('stripe');
    const stripe = new Stripe(secret);
    const account = await stripe.accounts.retrieve();
    const mode = secret.startsWith('sk_live_') ? 'live' : 'test';
    console.log(`Stripe OK (${mode}) — account ${account.id}`);
    if (!process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
        console.warn(
            'STRIPE_WEBHOOK_SECRET is not set. For local webhooks run:\n'
            + '  stripe listen --forward-to localhost:5050/api/payments/webhook',
        );
    }
    process.exit(0);
})().catch((error) => {
    fail(`Stripe connection failed: ${error.message}`);
});
