const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { classifyPasswordHashType } = require('./authPasswordHash');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await scrypt(password, salt, KEY_LENGTH);
    return `${salt}:${Buffer.from(derivedKey).toString('hex')}`;
}

async function verifyScryptPassword(password, passwordHash) {
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

async function verifyBcryptPassword(password, passwordHash) {
    try {
        const bcrypt = require('bcryptjs');
        return bcrypt.compare(password, passwordHash);
    } catch {
        return false;
    }
}

async function verifyPassword(password, passwordHash) {
    if (!password || typeof password !== 'string' || !passwordHash) {
        return false;
    }
    const hashText = typeof passwordHash === 'string' ? passwordHash : String(passwordHash);
    const hashType = classifyPasswordHashType(hashText);
    if (hashType === 'bcrypt') {
        return verifyBcryptPassword(password, hashText);
    }
    if (hashType === 'scrypt') {
        return verifyScryptPassword(password, hashText);
    }
    return false;
}

module.exports = {
    hashPassword,
    verifyPassword,
    KEY_LENGTH,
};
