/** Customer-safe payment messages (never expose secret env var names). */

const PUBLIC_UNAVAILABLE =
    'Secure checkout is temporarily unavailable. Please try again later or contact support.';

const PUBLIC_NOT_CONFIGURED =
    'We are finishing payment setup on our servers. Please try again in a few minutes.';

function stripeUserMessageFromReport(report = {}) {
    if (report.ok) return null;
    const code = report.code || 'STRIPE_INCOMPLETE_CONFIG';
    if (code === 'STRIPE_KEY_MISMATCH' || code === 'STRIPE_LIVE_KEY_BLOCKED' || code === 'STRIPE_KEY_INVALID') {
        return 'Payment configuration needs attention on the server. Our team has been notified.';
    }
    if (code === 'STRIPE_NOT_CONFIGURED' || code === 'STRIPE_INCOMPLETE_CONFIG') {
        return process.env.NODE_ENV === 'production' ? PUBLIC_NOT_CONFIGURED : PUBLIC_NOT_CONFIGURED;
    }
    return PUBLIC_UNAVAILABLE;
}

function stripeGuardUserMessage(guard) {
    if (!guard || guard.ok) return null;
    if (guard.code === 'STRIPE_KEY_MISMATCH' || guard.code === 'STRIPE_LIVE_KEY_BLOCKED') {
        return 'Payment mode is misconfigured. Checkout is paused until keys are aligned.';
    }
    if (guard.code === 'STRIPE_NOT_CONFIGURED') {
        return PUBLIC_NOT_CONFIGURED;
    }
    return PUBLIC_UNAVAILABLE;
}

module.exports = {
    PUBLIC_UNAVAILABLE,
    PUBLIC_NOT_CONFIGURED,
    stripeUserMessageFromReport,
    stripeGuardUserMessage,
};
