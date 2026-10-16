/**
 * Lightweight request validation helpers (no zod/joi dependency).
 * Controllers keep domain checks; these cover common shape/size guards.
 */

function isPlainObject(value) {
    return value != null && typeof value === 'object' && !Array.isArray(value);
}

function assertString(value, { field, min = 0, max = 10_000, required = true } = {}) {
    if (value == null || value === '') {
        if (!required) return null;
        const error = new Error(`${field || 'field'} is required`);
        error.status = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
    }
    if (typeof value !== 'string') {
        const error = new Error(`${field || 'field'} must be a string`);
        error.status = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
    }
    const trimmed = value.trim();
    if (trimmed.length < min || trimmed.length > max) {
        const error = new Error(`${field || 'field'} length must be between ${min} and ${max}`);
        error.status = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
    }
    return trimmed;
}

function assertInteger(value, { field, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, required = true } = {}) {
    if (value == null || value === '') {
        if (!required) return null;
        const error = new Error(`${field || 'field'} is required`);
        error.status = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
    }
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        const error = new Error(`${field || 'field'} must be an integer between ${min} and ${max}`);
        error.status = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
    }
    return parsed;
}

function assertEnum(value, allowed, { field, required = true } = {}) {
    if (value == null || value === '') {
        if (!required) return null;
        const error = new Error(`${field || 'field'} is required`);
        error.status = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
    }
    const key = String(value);
    if (!allowed.includes(key)) {
        const error = new Error(`${field || 'field'} must be one of: ${allowed.join(', ')}`);
        error.status = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
    }
    return key;
}

function assertBodyObject(req) {
    if (!isPlainObject(req.body)) {
        const error = new Error('JSON body is required');
        error.status = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
    }
    return req.body;
}

/**
 * Reject oversized string fields that slip past the global JSON parser
 * (e.g. a huge message inside a small envelope).
 */
function assertMaxFieldBytes(value, maxBytes, field = 'payload') {
    const size = Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value || ''), 'utf8');
    if (size > maxBytes) {
        const error = new Error(`${field} exceeds ${maxBytes} bytes`);
        error.status = 413;
        error.code = 'PAYLOAD_TOO_LARGE';
        throw error;
    }
    return size;
}

function validationErrorHandler(error, req, res, next) {
    if (error?.code === 'VALIDATION_ERROR' || error?.status === 400) {
        return res.status(error.status || 400).json({
            message: error.message || 'Invalid request',
            code: error.code || 'VALIDATION_ERROR',
            correlationId: req.correlationId,
        });
    }
    if (error?.code === 'PAYLOAD_TOO_LARGE' || error?.status === 413) {
        return res.status(413).json({
            message: error.message || 'Request payload too large',
            code: 'PAYLOAD_TOO_LARGE',
            correlationId: req.correlationId,
        });
    }
    return next(error);
}

module.exports = {
    isPlainObject,
    assertString,
    assertInteger,
    assertEnum,
    assertBodyObject,
    assertMaxFieldBytes,
    validationErrorHandler,
};
