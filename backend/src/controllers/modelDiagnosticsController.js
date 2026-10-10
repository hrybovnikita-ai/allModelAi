const { assertPlusTestDiagnosticsAccess } = require('../billing/plusTestMode');
const {
    buildModelDiagnosticsCatalog,
    runModelDiagnosticTest,
} = require('../services/modelDiagnosticsService');
const { isStripeTestMode } = require('../payments/stripeMode');

const getModelDiagnosticsCatalog = (req, res) => {
    if (!assertPlusTestDiagnosticsAccess(req, res)) return undefined;
    const catalog = buildModelDiagnosticsCatalog(req.user.email);
    return res.json({
        ...catalog,
        stripeTestMode: isStripeTestMode(),
        billableTestNotice: 'Each test sends a short prompt to the real provider and may consume quota.',
    });
};

const postModelDiagnosticTest = async (req, res) => {
    if (!assertPlusTestDiagnosticsAccess(req, res)) return undefined;
    const slug = String(req.body?.slug || '').trim();
    const variantId = String(req.body?.variantId || '').trim();
    const confirmBillable = req.body?.confirmBillable === true;
    const outcome = await runModelDiagnosticTest({
        email: req.user.email,
        slug,
        variantId,
        confirmBillable,
    });
    if (!outcome.ok && outcome.code === 'CONFIRMATION_REQUIRED') {
        return res.status(400).json(outcome);
    }
    if (!outcome.ok && outcome.code === 'RATE_LIMITED') {
        return res.status(429).json(outcome);
    }
    if (outcome.status === 404) {
        return res.status(404).json(outcome);
    }
    return res.status(outcome.ok ? 200 : outcome.status || 502).json(outcome);
};

module.exports = {
    getModelDiagnosticsCatalog,
    postModelDiagnosticTest,
};
