const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await scrypt(password, salt, KEY_LENGTH);
    return `${salt}:${Buffer.from(derivedKey).toString('hex')}`;
}

async function verifyPassword(password, passwordHash) {
    if (!passwordHash || typeof passwordHash !== 'string' || !passwordHash.includes(':')) {
        return false;
    }
    const [salt, storedKey] = passwordHash.split(':');
    if (!salt || !storedKey) return false;
    const derivedKey = Buffer.from(await scrypt(password, salt, KEY_LENGTH));
    const storedBuffer = Buffer.from(storedKey, 'hex');
    if (storedBuffer.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(storedBuffer, derivedKey);
}

module.exports = {
    hashPassword,
    verifyPassword,
    KEY_LENGTH,
};
