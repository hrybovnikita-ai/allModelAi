'use strict';

const { buildLiveActivationReadiness } = require('../payments/liveActivationReadiness');
const { fetchStripeMerchantRevenue } = require('../payments/merchantRevenue');
const { buildCheckoutInfo } = require('../payments/checkoutInfo');

const getLiveActivationReadiness = async (_req, res) => {
    const readiness = buildLiveActivationReadiness();
    return res.json({
        ...readiness,
        checkoutInfoSummary: {
            checkoutAvailable: buildCheckoutInfo().checkoutAvailable,
            primaryProvider: readiness.primaryProvider,
            showTestModeBanner: readiness.testMode,
        },
    });
};

const getMerchantRevenue = async (req, res) => {
    const limit = Number(req.query.limit) || 20;
    const payload = await fetchStripeMerchantRevenue({ limit });
    if (!payload.ok) {
        const status = payload.code === 'STRIPE_NOT_CONFIGURED' ? 503 : 502;
        return res.status(status).json(payload);
    }
    return res.json(payload);
};

module.exports = {
    getLiveActivationReadiness,
    getMerchantRevenue,
};
