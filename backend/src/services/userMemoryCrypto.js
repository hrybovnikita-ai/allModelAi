const crypto = require('node:crypto');

const PREFIX = 'enc:v1:';

function deriveKey() {
    const explicit = String(process.env.MEMORY_ENCRYPTION_KEY || '').trim();
    if (explicit) {
        return crypto.createHash('sha256').update(explicit).digest();
    }
    try {
        const { signingKey } = require('../sessionToken');
        const sessionSecret = signingKey();
        if (sessionSecret) {
            return crypto.createHash('sha256').update(`memory:${sessionSecret}`).digest();
        }
    } catch {
        /* test env */
    }
    if (process.env.NODE_ENV === 'test') {
        return crypto.createHash('sha256').update('allmodelai-test-memory-key').digest();
    }
    return null;
}

function encryptMemory(plaintext) {
    const key = deriveKey();
    const text = String(plaintext || '').trim();
    if (!text) return { stored: '', preview: '' };
    if (!key) {
        const err = new Error('Memory encryption is not configured on the server.');
        err.status = 503;
        err.code = 'MEMORY_ENCRYPTION_UNAVAILABLE';
        throw err;
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const stored = `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
    return {
        stored,
        preview: text.length > 120 ? `${text.slice(0, 117)}…` : text,
    };
}

function decryptMemory(stored) {
    const raw = String(stored || '');
    if (!raw) return '';
    if (!raw.startsWith(PREFIX)) return raw;
    const key = deriveKey();
    if (!key) return '';
    const payload = raw.slice(PREFIX.length);
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
    ]).toString('utf8');
}

module.exports = {
    encryptMemory,
    decryptMemory,
};
