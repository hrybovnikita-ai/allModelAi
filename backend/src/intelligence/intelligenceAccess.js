const { getCreditStatusCoreAsync } = require('../billing/creditStatusAsync');
const { isOwner } = require('../billing/accessControl');
const { isPlusTestEligible } = require('../billing/plusTestMode');

async function canAccessIntelligence(connection, email) {
    const status = await getCreditStatusCoreAsync(connection, email);
    if (isOwner(status)) return true;
    if (status.canAccessModelDiagnostics) return true;
    if (isPlusTestEligible(email)) return true;
    return false;
}

async function assertIntelligenceAccess(req, res) {
    const email = String(req.user?.email || '').trim().toLowerCase();
    if (!email) {
        res.status(401).json({ message: 'Unauthorized' });
        return false;
    }
    const allowed = await canAccessIntelligence(req.app.locals.db, email);
    if (!allowed) {
        res.status(404).json({ message: 'Not found' });
        return false;
    }
    return true;
}

async function assertOwnerForPolicyPromotion(req, res) {
    if (!(await assertIntelligenceAccess(req, res))) return false;
    const status = await getCreditStatusCoreAsync(req.app.locals.db, req.user.email);
    if (!isOwner(status)) {
        res.status(403).json({
            message: 'Routing policy promotion requires the application owner.',
            code: 'OWNER_REQUIRED',
        });
        return false;
    }
    return true;
}

module.exports = {
    canAccessIntelligence,
    assertIntelligenceAccess,
    assertOwnerForPolicyPromotion,
};
