const crypto = require('node:crypto');
const admin = require('./firebaseAdmin');
const { sessionCookieOptions } = require('./sessionCookie');
const { validSessionToken } = require('./sessionToken');
const { setSession } = require('./controllers/controllers');
const users = require('./data/data');
const providers = new Set(['google.com', 'apple.com', 'facebook.com']);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const stateCookie = 'allmodelai_social_state';
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const account = (db, id) => db.prepare('SELECT id, name, email, avatar_url AS avatar FROM users WHERE id = ?').get(id);
function sessionOwner(req) {
    const token = req.cookies?.allmodelai_session;
    if (!validSessionToken(token)) return null;
    return req.app.locals.db.database.prepare('SELECT user_id FROM auth_sessions WHERE token_hash = ? AND expires_at > ?').get(hash(token), Date.now())?.user_id || null;
}
function browserRequest(req, res, next) {
    const { isAllowedOrigin } = require('./publicAccess');
    // Explicit allowlist plus the live forwarded host. Custom header blocks form-based CSRF.
    const origin = req.get('origin');
    if (!origin || !isAllowedOrigin(origin, req) || req.get('x-allmodelai-auth') !== '1' || !req.is('application/json')) {
        return res.status(403).json({ message: 'Sign-in request origin could not be verified.' });
    }
    return next();
}
function challenge(req, res) {
    const link = req.body.intent === 'link';
    const owner = sessionOwner(req);
    if (link && !owner) return res.status(401).json({ message: 'Sign in to your existing account before linking a provider.' });
    const state = crypto.randomBytes(32).toString('hex');
    const db = req.app.locals.db.database;
    db.prepare('DELETE FROM social_auth_challenges WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO social_auth_challenges (state_hash, intent, session_hash, user_id, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(hash(state), link ? 'link' : 'login', link ? hash(req.cookies.allmodelai_session) : null, link ? owner : null, Date.now() + 300000);
    res.cookie(stateCookie, state, { ...sessionCookieOptions(), maxAge: 300000 });
    return res.json({ state });
}
function identity(claims) {
    const provider = claims.firebase?.sign_in_provider;
    const subjects = claims.firebase?.identities?.[provider];
    if (!providers.has(provider) || !Array.isArray(subjects) || subjects.length !== 1 || typeof subjects[0] !== 'string' || !subjects[0] || subjects[0].length > 512) {
        throw fail(401, 'INVALID_IDENTITY', 'Use Google, Apple or Facebook to sign in.');
    }
    if (!Number.isFinite(claims.auth_time) || claims.auth_time * 1000 < Date.now() - 300000 || claims.auth_time * 1000 > Date.now() + 30000) {
        throw fail(401, 'RECENT_LOGIN_REQUIRED', 'Sign in to your provider again, then retry.');
    }
    // No account is created or linked using an unverified email, including Facebook.
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (claims.email_verified !== true || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw fail(403, 'VERIFIED_EMAIL_REQUIRED', 'A verified email is required. Verify your provider email or use another sign-in method.');
    }
    let avatar = null;
    try { const url = new URL(claims.picture); if (url.protocol === 'https:' && url.href.length <= 2048) avatar = url.href; } catch { /* Optional image. */ }
    return { provider, subject: subjects[0], email, name: String(claims.name || email.split('@')[0]).slice(0, 100), avatar };
}
async function exchange(req, res) {
    try {
        const { idToken, state, intent } = req.body;
        if (typeof idToken !== 'string' || idToken.length > 20000 || typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state) || req.cookies?.[stateCookie] !== state) {
            throw fail(400, 'INVALID_REQUEST', 'Sign-in could not be verified. Please retry.');
        }
        const db = req.app.locals.db.database;
        const pending = db.prepare('SELECT * FROM social_auth_challenges WHERE state_hash = ? AND expires_at > ?').get(hash(state), Date.now());
        if (!pending || pending.intent !== (intent === 'link' ? 'link' : 'login')) throw fail(403, 'INVALID_STATE', 'Sign-in expired. Please retry.');
        const profile = identity(await admin.verifySocialToken(idToken));
        const result = db.transaction(() => {
            if (pending.intent === 'link' && (sessionOwner(req) !== pending.user_id || hash(req.cookies.allmodelai_session || '') !== pending.session_hash)) {
                throw fail(401, 'SESSION_CHANGED', 'Your session changed. Sign in and confirm linking again.');
            }
            if (!db.prepare('DELETE FROM social_auth_challenges WHERE state_hash = ? AND expires_at > ?').run(hash(state), Date.now()).changes) {
                throw fail(403, 'INVALID_STATE', 'Sign-in was already completed or expired.');
            }
            const linked = db.prepare('SELECT user_id FROM social_identities WHERE provider = ? AND subject = ?').get(profile.provider, profile.subject);
            let id = linked?.user_id;
            if (pending.intent === 'link') {
                if (id && id !== pending.user_id) throw fail(409, 'IDENTITY_CONFLICT', 'This provider identity is already connected to another account.');
                id = pending.user_id;
                const other = db.prepare('SELECT subject FROM social_identities WHERE user_id = ? AND provider = ?').get(id, profile.provider);
                if (other && other.subject !== profile.subject) throw fail(409, 'IDENTITY_CONFLICT', 'A different identity from this provider is already connected.');
            } else if (!id) {
                const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(profile.email);
                if (existing) throw fail(409, 'ACCOUNT_LINK_REQUIRED', 'Sign in to your existing AllModelAI account, then open Settings > Connected accounts to confirm linking.');
                id = Number(db.prepare('INSERT INTO users (name, email, avatar_url, email_verified) VALUES (?, ?, ?, 1)').run(profile.name, profile.email, profile.avatar).lastInsertRowid);
            }
            db.prepare('INSERT INTO social_identities (provider, subject, user_id) VALUES (?, ?, ?) ON CONFLICT(provider, subject) DO NOTHING').run(profile.provider, profile.subject, id);
            if (profile.avatar) db.prepare('UPDATE users SET avatar_url = COALESCE(avatar_url, ?) WHERE id = ?').run(profile.avatar, id);
            const user = account(db, id);
            if (pending.intent === 'login') setSession(req, res, user, req.body.rememberMe !== false);
            return user;
        }).immediate();
        // Keep the legacy account cache consistent; do not rewrite conversations or subscriptions.
        const stored = db.prepare('SELECT id, name, email, password_hash AS passwordHash FROM users WHERE id = ?').get(result.id);
        const index = users.findIndex(user => user.id === result.id);
        if (index < 0) users.push(stored); else users[index] = stored;
        res.clearCookie(stateCookie, sessionCookieOptions());
        return res.json({ user: result, linked: pending.intent === 'link' });
    } catch (error) {
        const status = error.status || (error.code?.startsWith('auth/') ? 401 : 503);
        return res.status(status).json({ code: error.status ? error.code : 'SOCIAL_AUTH_FAILED',
            message: error.status ? error.message : status === 401 ? 'Provider credentials are invalid, expired or revoked. Sign in again.' : 'Social sign-in is unavailable. Check server configuration or try again later.' });
    }
}
function connections(req, res) {
    const id = sessionOwner(req);
    if (!id) return res.status(401).json({ message: 'Sign in first.' });
    return res.json({ providers: req.app.locals.db.database.prepare('SELECT provider FROM social_identities WHERE user_id = ?').all(id).map(row => row.provider) });
}
module.exports = { browserRequest, challenge, exchange, connections };
