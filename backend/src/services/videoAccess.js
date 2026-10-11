const { MagicHourError } = require('./magicHourClient');
const { ownerPlusActive } = require('../billing/accessControl');

function assertVideoGenerationAllowed(creditStatus) {
    if (!creditStatus) {
        throw new MagicHourError('Sign in to generate videos.', {
            status: 401,
            code: 'VIDEO_AUTH_REQUIRED',
            retryable: false,
        });
    }
    if (ownerPlusActive(creditStatus)) return;
    if (creditStatus.canUseDeveloper && creditStatus.mode === 'developer') return;
    if (creditStatus.hasSubscription && creditStatus.active) return;
    if (creditStatus.plusTestMode) return;
    throw new MagicHourError(
        'AI video generation requires an active subscription or Developer access.',
        { status: 403, code: 'VIDEO_NOT_ALLOWED', retryable: false },
    );
}

module.exports = {
    assertVideoGenerationAllowed,
};
