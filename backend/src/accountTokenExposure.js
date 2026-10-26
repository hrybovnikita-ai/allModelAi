/**
 * When true, password-reset / verify-email responses may include the raw token in JSON.
 * Production with working email must never expose tokens to the client.
 */
function shouldExposeAccountTokenInResponse({ emailDeliveryConfigured = true } = {}) {
    if (process.env.NODE_ENV === 'test') return true;
    if (process.env.EXPOSE_ACCOUNT_TOKENS === 'true') return true;
    if (process.env.EXPOSE_ACCOUNT_TOKENS === 'false') return false;

    const production =
        process.env.NODE_ENV === 'production'
        || process.env.VERCEL === '1'
        || process.env.VERCEL === 'true';

    if (!production && !emailDeliveryConfigured) return true;
    return false;
}

module.exports = {
    shouldExposeAccountTokenInResponse,
};
