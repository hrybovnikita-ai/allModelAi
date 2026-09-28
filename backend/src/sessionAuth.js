const crypto = require('node:crypto');
const { validSessionToken } = require('./sessionToken');

const sessionCookie = 'allmodelai_session';
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function readSessionToken(req) {
    const headerToken = String(req.get('x-allmodelai-session') || '').trim();
    if (headerToken && validSessionToken(headerToken)) return headerToken;
    const cookieToken = req.cookies?.[sessionCookie];
    if (cookieToken && validSessionToken(cookieToken)) return cookieToken;
    return null;
}

module.exports = {
    sessionCookie,
    hashToken,
    readSessionToken,
};
