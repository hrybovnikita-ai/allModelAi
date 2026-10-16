const { redactSecrets, redactObject } = require('./redact');

/**
 * Structured security / ops logs with automatic secret redaction.
 * Does not write private chat message content.
 */
function structuredLog(level, event, details = {}) {
    if (process.env.NODE_ENV === 'test' && process.env.SECURITY_LOG_IN_TESTS !== 'true') {
        return;
    }
    const payload = {
        ts: new Date().toISOString(),
        level,
        event: String(event || 'event'),
        ...redactObject(details),
    };
    const line = JSON.stringify(payload, (_key, value) => {
        if (typeof value === 'string') return redactSecrets(value);
        return value;
    });
    if (level === 'error' || level === 'warn') {
        console.error(line);
    } else {
        console.log(line);
    }
}

function securityLog(event, details = {}) {
    structuredLog('info', `security.${event}`, details);
}

function securityWarn(event, details = {}) {
    structuredLog('warn', `security.${event}`, details);
}

function securityError(event, details = {}) {
    structuredLog('error', `security.${event}`, details);
}

module.exports = {
    structuredLog,
    securityLog,
    securityWarn,
    securityError,
};
