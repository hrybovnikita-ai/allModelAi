const { isPlusTestEligible, isProductionDeployment } = require('../billing/plusTestMode');
const { wayforpayConfig } = require('../wayforpay/config');
const { canUsePaymentSandboxAsync } = require('./paymentSandbox');

/**
 * WayForPay mock/test checkout (no hosted redirect, isTest payments only).
 * - Non-production + WAYFORPAY_TEST_MODE: any authenticated user.
 * - Production: owner / payment sandbox only (live WFP must stay locked down).
 */
async function canUseWayforpayTestCheckoutAsync(connection, user) {
    const cfg = wayforpayConfig();
    if (!cfg.testMode) return false;
    if (!user?.email) return false;
    if (await canUsePaymentSandboxAsync(connection, user)) return true;
    if (isPlusTestEligible(user.email)) return true;
    if (isProductionDeployment()) return false;
    return true;
}

async function assertWayforpayTestCheckoutAllowed(req, res) {
    const allowed = await canUseWayforpayTestCheckoutAsync(req.app.locals.db, req.user);
    if (allowed) return true;
    res.status(403).json({
        message: 'WayForPay test checkout is not available for this account in this environment. Use an owner account, enable local Plus Test Mode, or run the server in non-production with WAYFORPAY_TEST_MODE=true.',
        code: 'WAYFORPAY_TEST_CHECKOUT_FORBIDDEN',
        testModeRequired: true,
    });
    return false;
}

module.exports = {
    canUseWayforpayTestCheckoutAsync,
    assertWayforpayTestCheckoutAllowed,
};
