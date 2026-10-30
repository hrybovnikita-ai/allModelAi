const crypto = require('node:crypto');
const admin = require('./firebaseAdmin');
const { sessionCookieOptions } = require('./sessionCookie');
const { setSession } = require('./controllers/controllers');
const { hashToken, readSessionToken } = require('./sessionAuth');
const { shouldIssueNativeSessionToken } = require('./sessionCookie');
const users = require('./data/data');
const { normalizeLoginEmail } = require('./authHelpers');
const { isPostgresConnection } = require('./db/postgresHttpReads');
const githubSocialEmail = require('./githubSocialEmail');
const { promoteTrustedOwnerRoleAsync, promoteTrustedOwnerRoleSync } = require('./billing/ownerConfig');
const {
    exchangeSocialAuthAsync,
    getSessionOwnerUserIdAsync,
    getSocialChallengeAsync,
    getStoredUserForCacheAsync,
    insertSocialChallengeAsync,
    listSocialProvidersForUserAsync,
    purgeExpiredSocialChallengesAsync,
} = require('./db/postgresHttpSocial');

const providers = new Set(['google.com', 'apple.com', 'github.com', 'password']);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stateCookie = 'allmodelai_social_state';
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

function assertRecentFirebaseLogin(claims) {
    if (!Number.isFinite(claims.auth_time) || claims.auth_time * 1000 < Date.now() - 300000 || claims.auth_time * 1000 > Date.now() + 30000) {
        throw fail(401, 'RECENT_LOGIN_REQUIRED', 'Sign in to your provider again, then retry.');
    }
}

function verifiedEmailFromClaims(claims) {
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (claims.email_verified !== true || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw fail(403, 'VERIFIED_EMAIL_REQUIRED', 'A verified email is required. Verify your provider email or use another sign-in method.');
    }
    return email;
}

async function sessionOwner(req) {
    const token = readSessionToken(req);
    if (!token) return null;
    const connection = req.app.locals.db;
    if (isPostgresConnection(connection)) {
        return getSessionOwnerUserIdAsync(connection, hashToken(token), Date.now());
    }
    return connection.database.prepare('SELECT user_id FROM auth_sessions WHERE token_hash = ? AND expires_at > ?').get(hashToken(token), Date.now())?.user_id || null;
}

function browserRequest(req, res, next) {
    const { isAllowedOrigin } = require('./publicAccess');
    const origin = req.get('origin');
    if (!origin || !isAllowedOrigin(origin, req) || req.get('x-allmodelai-auth') !== '1' || !req.is('application/json')) {
        return res.status(403).json({ message: 'Sign-in request origin could not be verified.' });
    }
    return next();
}

async function challenge(req, res) {
    const link = req.body.intent === 'link';
    const owner = await sessionOwner(req);
    if (link && !owner) return res.status(401).json({ message: 'Sign in to your existing account before linking a provider.' });
    const state = crypto.randomBytes(32).toString('hex');
    const connection = req.app.locals.db;
    const expiresAt = Date.now() + 300000;
    if (isPostgresConnection(connection)) {
        await purgeExpiredSocialChallengesAsync(connection, Date.now());
        await insertSocialChallengeAsync(connection, {
            stateHash: hash(state),
            intent: link ? 'link' : 'login',
            sessionHash: link ? hash(readSessionToken(req)) : null,
            userId: link ? owner : null,
            expiresAt,
        });
    } else {
        const db = connection.database;
        db.prepare('DELETE FROM social_auth_challenges WHERE expires_at < ?').run(Date.now());
        db.prepare('INSERT INTO social_auth_challenges (state_hash, intent, session_hash, user_id, expires_at) VALUES (?, ?, ?, ?, ?)')
            .run(hash(state), link ? 'link' : 'login', link ? hash(readSessionToken(req)) : null, link ? owner : null, expiresAt);
    }
    res.cookie(stateCookie, state, { ...sessionCookieOptions(req), maxAge: 300000 });
    return res.json({ state });
}

function identity(claims) {
    const provider = claims.firebase?.sign_in_provider;
    const subjects = claims.firebase?.identities?.[provider];
    if (!providers.has(provider) || provider === 'password' || !Array.isArray(subjects) || subjects.length !== 1 || typeof subjects[0] !== 'string' || !subjects[0] || subjects[0].length > 512) {
        throw fail(401, 'INVALID_IDENTITY', 'Use Google, Apple, or GitHub to sign in.');
    }
    assertRecentFirebaseLogin(claims);
    const email = verifiedEmailFromClaims(claims);
    let avatar = null;
    try { const url = new URL(claims.picture); if (url.protocol === 'https:' && url.href.length <= 2048) avatar = url.href; } catch { /* optional */ }
    return { provider, subject: subjects[0], email, name: String(claims.name || email.split('@')[0]).slice(0, 100), avatar };
}

function passwordIdentity(claims) {
    assertRecentFirebaseLogin(claims);
    const email = verifiedEmailFromClaims(claims);
    const uid = claims.sub || claims.user_id;
    if (typeof uid !== 'string' || !uid || uid.length > 128) {
        throw fail(401, 'INVALID_IDENTITY', 'Email sign-in could not be verified. Please try again.');
    }
    return {
        provider: 'password',
        subject: uid,
        email,
        name: String(claims.name || email.split('@')[0]).slice(0, 100),
        avatar: null,
    };
}

function profileFromClaims(claims) {
    const provider = claims.firebase?.sign_in_provider;
    if (provider === 'password') {
        return passwordIdentity(claims);
    }
    return identity(claims);
}

function githubSubjectFromClaims(claims) {
    const provider = claims.firebase?.sign_in_provider;
    if (provider !== 'github.com') return null;
    const subjects = claims.firebase?.identities?.[provider];
    if (!Array.isArray(subjects) || subjects.length !== 1) return null;
    return typeof subjects[0] === 'string' ? subjects[0] : null;
}

function claimsNeedGitHubEmailResolution(claims) {
    if (claims.firebase?.sign_in_provider !== 'github.com') return false;
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (!email || claims.email_verified !== true) return true;
    return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function exchange(req, res) {
    try {
        const { state, intent } = req.body;
        const idToken = typeof req.body.idToken === 'string' ? req.body.idToken.trim() : '';
        const githubAccessToken = typeof req.body.githubAccessToken === 'string' ? req.body.githubAccessToken.trim() : '';
        if (
            (!idToken && !githubAccessToken)
            || idToken.length > 20000
            || githubAccessToken.length > 512
            || typeof state !== 'string'
            || !/^[a-f0-9]{64}$/.test(state)
            || req.cookies?.[stateCookie] !== state
        ) {
            throw fail(400, 'INVALID_REQUEST', 'Sign-in could not be verified. Please retry.');
        }
        const connection = req.app.locals.db;
        const nowMs = Date.now();
        let pending;
        if (isPostgresConnection(connection)) {
            pending = await getSocialChallengeAsync(connection, hash(state), nowMs);
        } else {
            pending = connection.database.prepare('SELECT * FROM social_auth_challenges WHERE state_hash = ? AND expires_at > ?').get(hash(state), nowMs);
        }
        if (!pending || pending.intent !== (intent === 'link' ? 'link' : 'login')) throw fail(403, 'INVALID_STATE', 'Sign-in expired. Please retry.');
        if (pending.intent === 'link' && !idToken) {
            throw fail(400, 'INVALID_REQUEST', 'Linking requires signing in with your provider first.');
        }

        let profile;
        let firebaseUid = null;

        if (idToken) {
            const claims = await admin.verifySocialToken(idToken);
            firebaseUid = claims.sub || claims.user_id || null;
            const provider = claims.firebase?.sign_in_provider;
            if (pending.intent === 'link' && provider === 'password') {
                throw fail(400, 'INVALID_REQUEST', 'Set your AllModelAI password in Settings or Forgot password instead of linking email this way.');
            }

            if (provider === 'github.com' && githubAccessToken) {
                assertRecentFirebaseLogin(claims);
                const subject = githubSubjectFromClaims(claims);
                if (!subject) throw fail(401, 'INVALID_IDENTITY', 'GitHub identity could not be verified.');
                profile = await githubSocialEmail.profileFromGitHubAccessToken(githubAccessToken, subject);
            } else if (provider === 'github.com' && claimsNeedGitHubEmailResolution(claims)) {
                // Firebase often omits private GitHub emails from the ID token. Without the
                // OAuth access token we cannot call GET /user/emails — do not conflate that
                // with "GitHub has no verified email".
                throw fail(
                    403,
                    'GITHUB_ACCESS_TOKEN_REQUIRED',
                    'GitHub sign-in needs email access. Sign in again and allow AllModelAI to read your GitHub email address (it can stay private).',
                );
            } else {
                profile = profileFromClaims(claims);
            }
        } else {
            profile = await githubSocialEmail.profileFromGitHubAccessToken(githubAccessToken);
        }
        const canonicalEmail = normalizeLoginEmail(profile.email);

        let result;
        if (isPostgresConnection(connection)) {
            if (pending.intent === 'link') {
                const owner = await sessionOwner(req);
                if (owner !== pending.user_id || hash(readSessionToken(req) || '') !== pending.session_hash) {
                    throw fail(401, 'SESSION_CHANGED', 'Your session changed. Sign in and confirm linking again.');
                }
            }
            result = await exchangeSocialAuthAsync(connection, {
                stateHash: hash(state),
                nowMs,
                profile,
                pending,
                canonicalEmail,
            });
            if (result.error) {
                throw fail(result.error.status, result.error.code, result.error.message);
            }
        } else {
            const db = connection.database;
            result = db.transaction(() => {
                if (pending.intent === 'link') {
                    const ownerSync = db.prepare('SELECT user_id FROM auth_sessions WHERE token_hash = ? AND expires_at > ?').get(hashToken(readSessionToken(req) || ''), Date.now())?.user_id;
                    if (ownerSync !== pending.user_id || hash(readSessionToken(req) || '') !== pending.session_hash) {
                        throw fail(401, 'SESSION_CHANGED', 'Your session changed. Sign in and confirm linking again.');
                    }
                }
                if (!db.prepare('DELETE FROM social_auth_challenges WHERE state_hash = ? AND expires_at > ?').run(hash(state), nowMs).changes) {
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
                    const existing = db.prepare(
                        'SELECT id, name FROM users WHERE lower(trim(email)) = ?',
                    ).get(canonicalEmail);
                    if (existing) {
                        throw fail(409, 'ACCOUNT_LINK_REQUIRED', 'Sign in to your existing account, then connect this provider in Settings. Use Forgot password if you need to recover access.');
                    } else {
                        id = Number(db.prepare('INSERT INTO users (name, email, avatar_url, email_verified) VALUES (?, ?, ?, 1)').run(profile.name, canonicalEmail, profile.avatar).lastInsertRowid);
                    }
                }
                db.prepare('INSERT INTO social_identities (provider, subject, user_id) VALUES (?, ?, ?) ON CONFLICT(provider, subject) DO NOTHING').run(profile.provider, profile.subject, id);
                if (profile.avatar) db.prepare('UPDATE users SET avatar_url = COALESCE(avatar_url, ?) WHERE id = ?').run(profile.avatar, id);
                db.prepare('UPDATE users SET email_verified = 1 WHERE id = ? AND email_verified IS NOT 1').run(id);
                const user = db.prepare('SELECT id, name, email, avatar_url AS avatar FROM users WHERE id = ?').get(id);
                return { user, createSession: pending.intent === 'login' };
            }).immediate();
        }

        if (firebaseUid && result?.user?.id) {
            if (isPostgresConnection(connection)) {
                await promoteTrustedOwnerRoleAsync(connection, result.user.id, firebaseUid);
            } else {
                promoteTrustedOwnerRoleSync(connection.database, result.user.id, firebaseUid);
            }
        }

        let stored;
        if (isPostgresConnection(connection)) {
            stored = await getStoredUserForCacheAsync(connection, result.user.id);
        } else {
            stored = connection.database.prepare('SELECT id, name, email, password_hash AS passwordHash FROM users WHERE id = ?').get(result.user.id);
        }
        // A local password reset must not be bypassed using an older Firebase
        // password. Firebase remains a bridge only for password-less accounts.
        if (profile.provider === 'password' && stored?.passwordHash) {
            throw fail(401, 'INVALID_CREDENTIALS', 'Sign in with your AllModelAI password or use Forgot password.');
        }
        let sessionToken;
        if (result.createSession) {
            sessionToken = await setSession(req, res, result.user, req.body.rememberMe !== false);
        }
        const index = users.findIndex((user) => user.id === result.user.id);
        if (index < 0) users.push(stored);
        else users[index] = stored;

        res.clearCookie(stateCookie, sessionCookieOptions(req));
        const payload = { user: result.user, linked: pending.intent === 'link' };
        if (shouldIssueNativeSessionToken(req) && sessionToken) {
            payload.nativeSessionToken = sessionToken;
        }
        return res.json(payload);
    } catch (error) {
        const firebaseAuthError = typeof error.code === 'string' && error.code.startsWith('auth/');
        const status = error.status || (firebaseAuthError ? 401 : 503);
        if (!error.status && !firebaseAuthError) {
            console.error('[AUTH] POST /api/auth/firebase failed:', error.code || 'UNKNOWN', error.message);
        }
        return res.status(status).json({
            code: error.status ? error.code : (firebaseAuthError ? error.code : 'SOCIAL_AUTH_FAILED'),
            message: error.status
                ? error.message
                : firebaseAuthError
                    ? 'Provider credentials are invalid, expired or revoked. Sign in again.'
                    : 'Social sign-in is unavailable. Check server configuration or try again later.',
        });
    }
}

async function connections(req, res) {
    const id = await sessionOwner(req);
    if (!id) return res.status(401).json({ message: 'Sign in first.' });
    const connection = req.app.locals.db;
    if (isPostgresConnection(connection)) {
        const providersList = await listSocialProvidersForUserAsync(connection, id);
        return res.json({ providers: providersList });
    }
    return res.json({ providers: connection.database.prepare('SELECT provider FROM social_identities WHERE user_id = ?').all(id).map((row) => row.provider) });
}

module.exports = { browserRequest, challenge, exchange, connections };
