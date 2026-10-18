'use strict';

const {
    assertStripeCheckoutAllowed,
    isStripeTestMode,
    getStripeMode,
} = require('./stripeMode');

/**
 * Read-only Stripe balance / payout snapshot for the merchant owner.
 * Never invents balances — returns provider data or a clear unavailable reason.
 */
async function fetchStripeMerchantRevenue({ limit = 20 } = {}) {
    const guard = assertStripeCheckoutAllowed();
    if (!guard.ok) {
        return {
            ok: false,
            provider: 'stripe',
            code: guard.code,
            message: guard.message,
            testMode: isStripeTestMode(),
            stripeMode: getStripeMode(),
        };
    }

    const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
    if (!secret) {
        return {
            ok: false,
            provider: 'stripe',
            code: 'STRIPE_NOT_CONFIGURED',
            message: 'STRIPE_SECRET_KEY is not configured.',
            testMode: true,
        };
    }

    const Stripe = require('stripe');
    const stripe = new Stripe(secret);
    const capped = Math.min(50, Math.max(1, Number(limit) || 20));

    try {
        const [balance, payouts, charges] = await Promise.all([
            stripe.balance.retrieve(),
            stripe.payouts.list({ limit: capped }),
            stripe.charges.list({ limit: capped, expand: ['data.balance_transaction'] }),
        ]);

        const available = (balance.available || []).map((row) => ({
            amount: row.amount,
            currency: String(row.currency || '').toUpperCase(),
            amountDisplay: formatMoney(row.amount, row.currency),
        }));
        const pending = (balance.pending || []).map((row) => ({
            amount: row.amount,
            currency: String(row.currency || '').toUpperCase(),
            amountDisplay: formatMoney(row.amount, row.currency),
        }));

        let grossSuccessful = 0;
        let refunded = 0;
        let feeEstimate = 0;
        const currency = String(charges.data[0]?.currency || available[0]?.currency || 'usd').toLowerCase();

        for (const charge of charges.data) {
            if (String(charge.currency || '').toLowerCase() !== currency) continue;
            if (charge.paid && !charge.refunded) grossSuccessful += charge.amount || 0;
            if (charge.amount_refunded) refunded += charge.amount_refunded || 0;
            if (charge.balance_transaction && typeof charge.balance_transaction === 'object') {
                feeEstimate += charge.balance_transaction.fee || 0;
            }
        }

        return {
            ok: true,
            provider: 'stripe',
            testMode: isStripeTestMode(),
            stripeMode: getStripeMode(),
            settlementNote: 'Balances and payouts come from the Stripe API for this account. Funds settle to the linked bank account on Stripe’s schedule after KYC approval.',
            balance: { available, pending },
            payouts: (payouts.data || []).map((p) => ({
                id: p.id,
                amount: p.amount,
                currency: String(p.currency || '').toUpperCase(),
                amountDisplay: formatMoney(p.amount, p.currency),
                status: p.status,
                arrivalDate: p.arrival_date
                    ? new Date(p.arrival_date * 1000).toISOString().slice(0, 10)
                    : null,
                method: p.method || null,
            })),
            recentChargesSummary: {
                currency: currency.toUpperCase(),
                sampleSize: charges.data.length,
                grossSuccessfulDisplay: formatMoney(grossSuccessful, currency),
                refundedDisplay: formatMoney(refunded, currency),
                providerFeesSampleDisplay: feeEstimate
                    ? formatMoney(feeEstimate, currency)
                    : null,
                netEstimatedDisplay: formatMoney(Math.max(0, grossSuccessful - refunded - feeEstimate), currency),
                note: feeEstimate
                    ? 'Fee sample uses expanded balance_transaction when Stripe returns it; otherwise fees show as null.'
                    : 'Provider fee totals require balance_transaction expansion; open Stripe Dashboard for exact fees.',
            },
            dashboardUrls: {
                payments: 'https://dashboard.stripe.com/payments',
                payouts: 'https://dashboard.stripe.com/payouts',
                balance: 'https://dashboard.stripe.com/balance/overview',
            },
            retrievedAt: new Date().toISOString(),
        };
    } catch (error) {
        const message = String(error?.message || 'Stripe revenue request failed');
        const code = /permission|restricted|oauth/i.test(message)
            ? 'STRIPE_ACCOUNT_RESTRICTED'
            : 'STRIPE_REVENUE_UNAVAILABLE';
        return {
            ok: false,
            provider: 'stripe',
            code,
            message: 'Could not load Stripe balance/payouts for this account. Confirm the secret key has balance read permission and the merchant account is active.',
            detail: message.slice(0, 180),
            testMode: isStripeTestMode(),
            stripeMode: getStripeMode(),
        };
    }
}

function formatMoney(amountCents, currency) {
    const cents = Number(amountCents) || 0;
    const cur = String(currency || 'usd').toUpperCase();
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: cur.length === 3 ? cur : 'USD',
        }).format(cents / 100);
    } catch {
        return `${(cents / 100).toFixed(2)} ${cur}`;
    }
}

module.exports = {
    fetchStripeMerchantRevenue,
    formatMoney,
};
