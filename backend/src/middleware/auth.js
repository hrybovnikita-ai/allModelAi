const crypto = require('node:crypto');

const sessionCookie = 'allmodelai_session';
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const requireAuth = (req, res, next) => {
    const token = req.cookies?.[sessionCookie];
    const bearer = String(req.get('authorization') || '').match(/^Bearer\s+(amai_[A-Za-z0-9_-]+)$/i)?.[1];
    if (bearer) {
        const key = req.app.locals.db.database.prepare(`SELECT developer_api_keys.*, users.id AS user_id, users.name AS user_name FROM developer_api_keys JOIN users ON lower(users.email) = lower(developer_api_keys.email) WHERE key_hash = ? AND (expires_at IS NULL OR expires_at > ?)`).get(hashToken(bearer), new Date().toISOString());
        if (!key) return res.status(401).json({ message: 'Invalid or expired API key' });
        if (key.used_count >= key.request_limit) return res.status(429).json({ message: 'API key request budget reached' });
        req.app.locals.db.database.prepare('UPDATE developer_api_keys SET last_used_at = ?, used_count = used_count + 1 WHERE id = ?').run(new Date().toISOString(), key.id);
        req.user = { id: key.user_id, name: key.user_name, email: key.email };
        req.authType = 'api_key'; req.apiKeyId = key.id;
        return next();
    }
    if (!token) return res.status(401).json({ message: 'Sign in or provide a Bearer API key' });
    const user = req.app.locals.db.database.prepare(`
        SELECT users.id, users.name, users.email
        FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id
        WHERE token_hash = ? AND expires_at > ?
    `).get(hashToken(token), Date.now());
    if (!user) return res.status(401).json({ message: 'Session expired. Sign in again.' });
    req.user = user;
    req.authType = 'session';
    return next();
};

const requireAdmin = (req, res, next) => {
    if (!process.env.ADMIN_KEY) return res.status(503).json({ message: 'Admin access is not configured' });
    if (req.get('x-admin-key') !== process.env.ADMIN_KEY) return res.status(401).json({ message: 'Invalid admin key' });
    return next();
};

module.exports = { requireAuth, requireAdmin };
