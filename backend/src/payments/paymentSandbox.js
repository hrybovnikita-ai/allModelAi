const { isOwnerRole } = require('../billing/accessControl');
const { readUserRoleAsync, readUserRoleSync } = require('../billing/userRole');

const paymentOwnerEmails = () => new Set(
    String(process.env.PAYMENT_OWNER_EMAILS || process.env.OWNER_EMAILS || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
);

function canUsePaymentSandboxSync(connection, user) {
    if (!user?.email) return false;
    const email = String(user.email).trim().toLowerCase();
    if (paymentOwnerEmails().has(email)) return true;
    const role = readUserRoleSync(connection, email);
    return isOwnerRole(role);
}

async function canUsePaymentSandboxAsync(connection, user) {
    if (!user?.email) return false;
    const email = String(user.email).trim().toLowerCase();
    if (paymentOwnerEmails().has(email)) return true;
    const role = await readUserRoleAsync(connection, email);
    return isOwnerRole(role);
}

async function requirePaymentSandboxUser(req, res) {
    const allowed = await canUsePaymentSandboxAsync(req.app.locals.db, req.user);
    if (!allowed) {
        res.status(403).json({
            message: 'Owner-only test checkout. Use a site owner account to simulate payments, or complete live checkout when enabled on the server.',
            code: 'PAYMENT_SANDBOX_FORBIDDEN',
        });
        return false;
    }
    return true;
}

module.exports = {
    paymentOwnerEmails,
    canUsePaymentSandboxSync,
    canUsePaymentSandboxAsync,
    requirePaymentSandboxUser,
};
