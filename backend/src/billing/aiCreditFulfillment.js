const { resolvePackConfig } = require('./aiCreditPackages');
const { grantCreditsIdempotentAsync } = require('./aiCreditLedger');

/**
 * Server-side fulfillment for prepaid AI credit packs (Stripe, Creem, etc.).
 * Credits are granted only after verified payment webhooks.
 */
async function fulfillAiCreditPackPurchase(connection, {
    email,
    packageId,
    amountPaidCents,
    referenceId,
    provider = 'unknown',
    metadata = {},
    requirePaidAmount = true,
}) {
    const pack = resolvePackConfig(packageId);
    if (!pack) throw new Error('Unknown AI credit package');
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) throw new Error('Missing email for AI credit fulfillment');
    const ref = String(referenceId || '').trim();
    if (!ref) throw new Error('Missing idempotency reference for AI credit fulfillment');
    const paid = Number(amountPaidCents);
    if (requirePaidAmount) {
        if (!Number.isFinite(paid)) {
            const err = new Error('Paid amount is required for AI credit fulfillment');
            err.code = 'AI_CREDIT_AMOUNT_MISSING';
            throw err;
        }
        if (paid !== pack.priceUsdCents) {
            const err = new Error('Paid amount does not match configured package price');
            err.code = 'AI_CREDIT_PRICE_MISMATCH';
            throw err;
        }
    } else if (amountPaidCents != null && Number.isFinite(paid) && paid !== pack.priceUsdCents) {
        const err = new Error('Paid amount does not match configured package price');
        err.code = 'AI_CREDIT_PRICE_MISMATCH';
        throw err;
    }
    const result = await grantCreditsIdempotentAsync(connection, {
        email: normalizedEmail,
        amount: pack.credits,
        referenceId: ref,
        entryType: 'purchase',
        metadata: {
            packageId: pack.id,
            provider,
            priceUsdCents: pack.priceUsdCents,
            amountPaidCents: Number.isFinite(paid) ? paid : null,
            ...metadata,
        },
    });
    return {
        email: normalizedEmail,
        packageId: pack.id,
        credits: pack.credits,
        provider,
        ...result,
    };
}

module.exports = {
    fulfillAiCreditPackPurchase,
};
