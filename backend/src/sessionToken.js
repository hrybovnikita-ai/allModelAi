const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
function signingKey() {
    const key = process.env.JWT_SECRET;
    if (key && Buffer.byteLength(key) < 32) throw new Error('JWT_SECRET must be at least 32 bytes');
    return key;
}
function createSessionToken(userId, expiresAt) {
    const key = signingKey();
    if (!key) return crypto.randomBytes(32).toString('hex');
    return jwt.sign({ exp: Math.floor(expiresAt / 1000) }, key, {
        algorithm: 'HS256', subject: String(userId), issuer: 'allmodelai',
        audience: 'allmodelai-session', jwtid: crypto.randomUUID(),
    });
}
function validSessionToken(token) {
    if (typeof token !== 'string') return false;
    // Existing opaque sessions remain valid until their database expiry.
    if (/^[a-f0-9]{64}$/.test(token)) return true;
    try {
        const payload = jwt.verify(token, signingKey(), {
            algorithms: ['HS256'], issuer: 'allmodelai', audience: 'allmodelai-session',
        });
        return typeof payload.sub === 'string' && Number.isFinite(payload.exp);
    } catch { return false; }
}
module.exports = { createSessionToken, validSessionToken, signingKey };
