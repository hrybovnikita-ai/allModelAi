const users = require('./data/data');
const { hashPassword, verifyPassword } = require('./password');
const { extractPasswordHash, isValidPasswordHashFormat } = require('./authPasswordHash');
const { authLog, normalizeLoginEmail, validatePasswordEnrollmentInput } = require('./authHelpers');
const { loadAuthUserByEmailAsync } = require('./authUser');
const { isPostgresConnection } = require('./db/postgresHttpReads');
const { getPasswordHashByUserIdAsync } = require('./db/postgresHttpAuth');
const { updateUserPasswordAsync } = require('./db/postgresHttpProduction');
const { listSocialProvidersForUserAsync } = require('./db/postgresHttpSocial');

function coerceUserId(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

async function readPasswordHashForUser(connection, userId) {
    const id = coerceUserId(userId);
    if (id == null) return null;
    if (isPostgresConnection(connection)) {
        return getPasswordHashByUserIdAsync(connection, id);
    }
    const row = connection.database.prepare('SELECT password_hash FROM users WHERE id = ?').get(id);
    return extractPasswordHash(row);
}

function listProvidersForUser(connection, userId) {
    if (isPostgresConnection(connection)) {
        return listSocialProvidersForUserAsync(connection, userId);
    }
    return Promise.resolve(
        connection.database
            .prepare('SELECT provider FROM social_identities WHERE user_id = ?')
            .all(userId)
            .map((row) => row.provider),
    );
}

function syncUserPasswordCache(userId, passwordHash) {
    const index = users.findIndex((entry) => entry.id === userId);
    if (index < 0) return;
    users[index] = { ...users[index], passwordHash };
}

async function refreshCachedAuthUser(connection, email) {
    const normalized = normalizeLoginEmail(email);
    if (!normalized) return null;
    const refreshed = await loadAuthUserByEmailAsync(connection, normalized);
    if (!refreshed?.id) return null;
    const index = users.findIndex((entry) => entry.id === refreshed.id);
    const entry = {
        id: refreshed.id,
        name: refreshed.name,
        email: refreshed.email,
        passwordHash: refreshed.passwordHash ?? null,
    };
    if (index >= 0) {
        users[index] = { ...users[index], ...entry };
    } else {
        users.push(entry);
    }
    return refreshed;
}

const getAccountSecurity = async (req, res) => {
    const connection = req.app.locals.db;
    const userId = req.user.id;
    try {
        const [passwordHash, providers] = await Promise.all([
            readPasswordHashForUser(connection, userId),
            listProvidersForUser(connection, userId),
        ]);
        return res.json({
            passwordEnabled: Boolean(passwordHash),
            providers,
            email: req.user.email,
        });
    } catch (error) {
        authLog('ACCOUNT_SECURITY_FAILED', { code: error.code || 'unknown' });
        return res.status(500).json({ message: 'Could not load account security settings.' });
    }
};

const setAccountPassword = async (req, res) => {
    const connection = req.app.locals.db;
    const userId = coerceUserId(req.user?.id);
    if (userId == null) {
        authLog('PASSWORD_ENROLL_FAILED', { code: 'INVALID_USER_ID' });
        return res.status(401).json({ message: 'Sign in again, then set your AllModelAI password.' });
    }
    authLog('PASSWORD_ENROLL_START', { userId, emailPresent: Boolean(req.user?.email) });

    let passwordHash;
    try {
        passwordHash = await readPasswordHashForUser(connection, userId);
    } catch (error) {
        authLog('PASSWORD_ENROLL_LOOKUP_FAILED', { userId, code: error.code || 'unknown' });
        return res.status(500).json({ message: 'Could not update your password. Please try again.' });
    }

    const passwordEnabled = Boolean(passwordHash) && isValidPasswordHashFormat(passwordHash);
    const validation = validatePasswordEnrollmentInput(
        {
            newPassword: req.body?.newPassword ?? req.body?.password,
            confirmPassword: req.body?.confirmPassword,
            currentPassword: req.body?.currentPassword,
        },
        { passwordEnabled },
    );
    if (!validation.ok) {
        authLog('PASSWORD_ENROLL_VALIDATION_FAILED', { userId, status: validation.status });
        return res.status(validation.status).json({ message: validation.message });
    }

    if (passwordEnabled) {
        let matches = false;
        try {
            matches = await verifyPassword(validation.currentPassword, passwordHash);
        } catch {
            matches = false;
        }
        if (!matches) {
            return res.status(401).json({
                code: 'CURRENT_PASSWORD_INVALID',
                message: 'Current password is incorrect.',
            });
        }
    }

    try {
        const nextHash = await hashPassword(validation.newPassword);
        if (!isValidPasswordHashFormat(nextHash)) {
            authLog('PASSWORD_ENROLL_FAILED', { userId, code: 'HASH_FORMAT_INVALID' });
            return res.status(500).json({ message: 'Could not save your password. Please try again.' });
        }
        if (isPostgresConnection(connection)) {
            await updateUserPasswordAsync(connection, nextHash, {
                userId,
                email: req.user.email,
                revokeSessions: passwordEnabled,
            });
        } else {
            const result = connection.database
                .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                .run(nextHash, userId);
            if (!result.changes) {
                const error = new Error('No user record was updated');
                error.code = 'PASSWORD_UPDATE_NO_ROW';
                throw error;
            }
            if (passwordEnabled) {
                connection.database
                    .prepare('DELETE FROM auth_sessions WHERE user_id = ?')
                    .run(userId);
            }
        }

        // Confirm the same login lookup path can see the new hash before succeeding.
        const persisted = await readPasswordHashForUser(connection, userId);
        if (!persisted || !isValidPasswordHashFormat(persisted)) {
            authLog('PASSWORD_ENROLL_FAILED', { userId, code: 'HASH_NOT_PERSISTED' });
            return res.status(500).json({
                code: 'PASSWORD_NOT_PERSISTED',
                message: 'Password could not be saved to the account database. Please try again.',
            });
        }
        const loginProbe = await loadAuthUserByEmailAsync(
            connection,
            normalizeLoginEmail(req.user.email),
        );
        if (!loginProbe?.passwordHash || !isValidPasswordHashFormat(loginProbe.passwordHash)) {
            authLog('PASSWORD_ENROLL_FAILED', { userId, code: 'LOGIN_LOOKUP_MISSING_HASH' });
            return res.status(500).json({
                code: 'PASSWORD_NOT_PERSISTED',
                message: 'Password could not be saved to the account database. Please try again.',
            });
        }

        syncUserPasswordCache(userId, persisted);
        await refreshCachedAuthUser(connection, req.user.email);
        authLog('PASSWORD_ENROLL_SUCCESS', {
            userId,
            hadPassword: passwordEnabled,
            loginLookupReady: true,
        });
        return res.json({
            message: passwordEnabled
                ? 'Password updated. Sign in again on other devices if needed.'
                : 'Password created. You can sign in with email and password or Google.',
            passwordEnabled: true,
            sessionRevoked: passwordEnabled,
        });
    } catch (error) {
        authLog('PASSWORD_ENROLL_FAILED', { userId, code: error.code || 'unknown' });
        return res.status(500).json({ message: 'Could not save your password. Please try again.' });
    }
};

function sanitizeAvatarUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:' || url.href.length > 2048) return null;
        return url.href;
    } catch {
        return null;
    }
}

const updateAccountProfile = async (req, res) => {
    const connection = req.app.locals.db;
    const userId = req.user.id;
    const name = String(req.body?.name || '').trim();
    if (name.length < 2 || name.length > 100) {
        return res.status(400).json({ message: 'Name must be between 2 and 100 characters.' });
    }
    const avatarInput = req.body?.avatar;
    let avatar = null;
    if (avatarInput != null && String(avatarInput).trim()) {
        avatar = sanitizeAvatarUrl(avatarInput);
        if (avatar === null) {
            return res.status(400).json({ message: 'Avatar must be a valid https URL.' });
        }
    } else {
        avatar = '';
    }

    try {
        if (isPostgresConnection(connection)) {
            const { queryPgPool, resolvePostgresAsyncPool } = require('./db/pgPoolQuery');
            const pool = resolvePostgresAsyncPool(connection);
            await queryPgPool(
                pool,
                'UPDATE users SET name = $1, avatar_url = $2 WHERE id = $3',
                [name, avatar || null, userId],
            );
        } else {
            connection.database
                .prepare('UPDATE users SET name = ?, avatar_url = ? WHERE id = ?')
                .run(name, avatar || null, userId);
        }
        const index = users.findIndex((entry) => entry.id === userId);
        if (index >= 0) {
            users[index] = { ...users[index], name, avatar: avatar || null };
        }
        authLog('PROFILE_UPDATE_SUCCESS', { userId });
        return res.json({
            message: 'Profile saved.',
            user: {
                id: userId,
                name,
                email: req.user.email,
                avatar: avatar || null,
            },
        });
    } catch (error) {
        authLog('PROFILE_UPDATE_FAILED', { code: error.code || 'unknown' });
        return res.status(500).json({ message: 'Could not save your profile. Please try again.' });
    }
};

module.exports = {
    getAccountSecurity,
    setAccountPassword,
    updateAccountProfile,
    refreshCachedAuthUser,
};
