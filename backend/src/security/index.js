const { redactSecrets, redactObject, safeErrorMessage } = require('./redact');
const { structuredLog, securityLog, securityWarn, securityError } = require('./structuredLog');
const { securityHeadersMiddleware } = require('./securityHeaders');
const { csrfGuardMiddleware } = require('./csrfGuard');
const {
    createIpRateLimitMiddleware,
    createUserRateLimitMiddleware,
    resetRateLimitMemory,
} = require('./apiRateLimit');
const {
    assertString,
    assertInteger,
    assertEnum,
    assertBodyObject,
    assertMaxFieldBytes,
    validationErrorHandler,
} = require('./validateRequest');
const { logAdminAudit, adminAuditMiddleware, sanitizeAdminMetadata } = require('./adminAudit');
const { ensureAdminAuditSchema } = require('./adminAuditSchema');

module.exports = {
    redactSecrets,
    redactObject,
    safeErrorMessage,
    structuredLog,
    securityLog,
    securityWarn,
    securityError,
    securityHeadersMiddleware,
    csrfGuardMiddleware,
    createIpRateLimitMiddleware,
    createUserRateLimitMiddleware,
    resetRateLimitMemory,
    assertString,
    assertInteger,
    assertEnum,
    assertBodyObject,
    assertMaxFieldBytes,
    validationErrorHandler,
    logAdminAudit,
    adminAuditMiddleware,
    sanitizeAdminMetadata,
    ensureAdminAuditSchema,
};
