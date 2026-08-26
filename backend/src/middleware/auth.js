const crypto = require('node:crypto');

const sessionCookie = 'allmodelai_session';
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const requireAuth = (req, res, next) => {
    const token = req.cookies?.[sessionCookie];
    if (!token) return res.status(401).json({ message: 'Sign in to continue' });
    const user = req.app.locals.db.database.prepare(`
        SELECT users.id, users.name, users.email
        FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id
        WHERE token_hash = ? AND expires_at > ?
    `).get(hashToken(token), Date.now());
    if (!user) return res.status(401).json({ message: 'Session expired. Sign in again.' });
    req.user = user;
    return next();
};

const requireAdmin = (req, res, next) => {
    if (!process.env.ADMIN_KEY) return res.status(503).json({ message: 'Admin access is not configured' });
    if (req.get('x-admin-key') !== process.env.ADMIN_KEY) return res.status(401).json({ message: 'Invalid admin key' });
    return next();
};

module.exports = { requireAuth, requireAdmin };
