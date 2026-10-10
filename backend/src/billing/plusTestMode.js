const { subscriptionPlans } = require('./plans');

const envTrim = (name) => String(process.env[name] || '').trim();

function isProductionDeployment() {
    if (process.env.NODE_ENV === 'production') return true;
    if (envTrim('VERCEL') === '1' || envTrim('VERCEL').toLowerCase() === 'true') return true;
    return false;
}

/** Server-side dev flag — never active in production. */
function isPlusTestModeServerEnabled() {
    if (isProductionDeployment()) return false;
    return envTrim('ENABLE_PLUS_TEST_MODE') === 'true';
}

function developerAllowlist() {
    return new Set(
        String(process.env.DEVELOPER_EMAILS || '')
            .split(',')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean),
    );
}

function isAllowlistedDeveloper(email) {
    return developerAllowlist().has(String(email || '').trim().toLowerCase());
}

function isPlusTestEligible(email) {
    return isPlusTestModeServerEnabled() && isAllowlistedDeveloper(email);
}

/**
 * Applies Plus Test Mode rules to credit status (server-authoritative).
 * @param {object} base - credit fields before plus-test merge
 */
function applyPlusTestCreditStatus(base) {
    const allowlisted = isAllowlistedDeveloper(base.email);
    const plusTestServerEnabled = isPlusTestModeServerEnabled();
    const plusTestEligible = plusTestServerEnabled && allowlisted;
    const hasSubscription = Boolean(base.hasSubscription);

    const canUseDeveloper = hasSubscription || plusTestEligible;
    const savedDeveloper = base.savedMode === 'developer';
    const mode = canUseDeveloper && savedDeveloper ? 'developer' : 'user';
    const plusTestModeActive = plusTestEligible && mode === 'developer' && !hasSubscription;
    const fullAccess = mode === 'developer' && canUseDeveloper;

    const planModels = subscriptionPlans[base.plan]?.models || subscriptionPlans.free.models;
    const models = fullAccess ? ['all'] : (base.models || planModels);

    return {
        ...base,
        isDeveloper: allowlisted,
        canUseDeveloper,
        mode,
        plusTestMode: plusTestModeActive,
        plusTestEligible,
        plusTestServerEnabled: plusTestServerEnabled && allowlisted,
        models,
        unlimited: fullAccess,
        enforced: !fullAccess && base.enforced,
        canAccessModelDiagnostics: plusTestEligible || base.isOwner === true,
    };
}

function assertPlusTestDiagnosticsAccess(req, res) {
    const email = String(req.user?.email || '').trim().toLowerCase();
    if (!isPlusTestEligible(email)) {
        res.status(404).json({ message: 'Not found' });
        return false;
    }
    return true;
}

function assertPlusTestSandboxAccess(req, res) {
    const email = String(req.user?.email || '').trim().toLowerCase();
    if (!isPlusTestEligible(email)) {
        res.status(403).json({
            message: 'Developer sandbox actions require local Plus Test Mode and an allowlisted account.',
            code: 'PLUS_TEST_FORBIDDEN',
            useStripe: true,
        });
        return false;
    }
    return true;
}

module.exports = {
    applyPlusTestCreditStatus,
    assertPlusTestDiagnosticsAccess,
    assertPlusTestSandboxAccess,
    developerAllowlist,
    isAllowlistedDeveloper,
    isPlusTestEligible,
    isPlusTestModeServerEnabled,
    isProductionDeployment,
};
