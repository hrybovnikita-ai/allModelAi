/**
 * Prepaid AI credit packs — prices and credits are defined server-side only (Stripe TEST MODE).
 */

const PACK_IDS = ['starter', 'plus', 'pro', 'ultimate'];

function envInt(name, fallback) {
    const raw = String(process.env[name] || '').trim();
    if (!raw) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
}

function envNum(name, fallback) {
    const raw = String(process.env[name] || '').trim();
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

/** USD cents — override via AI_CREDIT_PACK_* env vars. */
const DEFAULT_PACKS = {
    starter: { name: 'Starter', credits: 500, priceUsdCents: 500, apiCostBasisUsdCents: 380 },
    plus: { name: 'Plus', credits: 1100, priceUsdCents: 1000, apiCostBasisUsdCents: 820 },
    pro: { name: 'Pro', credits: 2400, priceUsdCents: 2000, apiCostBasisUsdCents: 1680 },
    ultimate: { name: 'Ultimate', credits: 6500, priceUsdCents: 5000, apiCostBasisUsdCents: 4100 },
};

function resolvePackConfig(packageId) {
    const id = String(packageId || '').trim().toLowerCase();
    if (!PACK_IDS.includes(id)) return null;
    const base = DEFAULT_PACKS[id];
    const prefix = `AI_CREDIT_PACK_${id.toUpperCase()}`;
    return {
        id,
        name: process.env[`${prefix}_NAME`]?.trim() || base.name,
        credits: envInt(`${prefix}_CREDITS`, base.credits),
        priceUsdCents: envInt(`${prefix}_PRICE_USD_CENTS`, base.priceUsdCents),
        apiCostBasisUsdCents: envInt(`${prefix}_API_COST_USD_CENTS`, base.apiCostBasisUsdCents),
    };
}

function stripePriceIdForCreditPack(packageId) {
    const id = String(packageId || '').trim().toLowerCase();
    return String(process.env[`STRIPE_PRICE_AI_CREDITS_${id.toUpperCase()}`] || '').trim();
}

function creemProductIdForCreditPack(packageId) {
    const id = String(packageId || '').trim().toLowerCase();
    return String(process.env[`CREEM_PRODUCT_AI_CREDITS_${id.toUpperCase()}`] || '').trim();
}

function resolvePackageIdFromCreemProduct(productId) {
    const pid = String(productId || '').trim();
    if (!pid) return null;
    for (const id of PACK_IDS) {
        if (creemProductIdForCreditPack(id) === pid) return id;
    }
    return null;
}

function processingFeePercent() {
    return envNum('AI_CREDIT_STRIPE_FEE_PERCENT', 2.9);
}

function processingFeeFixedUsdCents() {
    return envInt('AI_CREDIT_STRIPE_FEE_FIXED_USD_CENTS', 30);
}

function buildPricingTransparency(pack) {
    const feePct = processingFeePercent();
    const feeFixed = processingFeeFixedUsdCents();
    const stripeFeeEstimate = Math.round(pack.priceUsdCents * (feePct / 100) + feeFixed);
    const netAfterFees = Math.max(pack.priceUsdCents - stripeFeeEstimate, 0);
    return {
        currency: 'USD',
        priceUsdCents: pack.priceUsdCents,
        priceDisplay: `$${(pack.priceUsdCents / 100).toFixed(2)}`,
        creditsIncluded: pack.credits,
        apiCostBasisUsdCents: pack.apiCostBasisUsdCents,
        estimatedStripeFeeUsdCents: stripeFeeEstimate,
        estimatedNetAfterFeesUsdCents: netAfterFees,
        feePercentExample: feePct,
        feeFixedUsdCentsExample: feeFixed,
        disclaimer: 'One-time prepaid AI credits. Credits are granted only after verified payment webhooks (Stripe or Creem). Real Creem checkout stays disabled until merchant approval.',
        prepaidEligibilityNote: 'Confirm prepaid AI credit eligibility with your payment provider before enabling live payments.',
    };
}

function getPublicCreditPackages() {
    return PACK_IDS.map((id) => {
        const pack = resolvePackConfig(id);
        if (!pack) return null;
        return {
            id: pack.id,
            name: pack.name,
            ...buildPricingTransparency(pack),
        };
    }).filter(Boolean);
}

function getPublicCreditPackage(packageId) {
    const pack = resolvePackConfig(packageId);
    if (!pack) return null;
    return {
        id: pack.id,
        name: pack.name,
        ...buildPricingTransparency(pack),
    };
}

function assertValidCreditPackageId(packageId) {
    return resolvePackConfig(packageId);
}

module.exports = {
    PACK_IDS,
    assertValidCreditPackageId,
    creemProductIdForCreditPack,
    getPublicCreditPackage,
    getPublicCreditPackages,
    resolvePackageIdFromCreemProduct,
    resolvePackConfig,
    stripePriceIdForCreditPack,
};
