const users = require('./data/data');
const { hashPassword, verifyPassword } = require('./password');
const { extractPasswordHash } = require('./authPasswordHash');
const { authLog, normalizeLoginEmail, validatePasswordEnrollmentInput } = require('./authHelpers');
const { loadAuthUserByEmailAsync } = require('./authUser');
const { isPostgresConnection } = require('./db/postgresHttpReads');
const { getPasswordHashByUserIdAsync } = require('./db/postgresHttpAuth');
const { updateUserPasswordAsync } = require('./db/postgresHttpProduction');
const { listSocialProvidersForUserAsync } = require('./db/postgresHttpSocial');

function readPasswordHashForUser(connection, userId) {
    if (isPostgresConnection(connection)) {
        return getPasswordHashByUserIdAsync(connection, userId);
    }
    const row = connection.database.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    return Promise.resolve(extractPasswordHash(row));
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
    const userId = req.user.id;
    let passwordHash;
    try {
        passwordHash = await readPasswordHashForUser(connection, userId);
    } catch (error) {
        authLog('PASSWORD_ENROLL_LOOKUP_FAILED', { code: error.code || 'unknown' });
        return res.status(500).json({ message: 'Could not update your password. Please try again.' });
    }

    const passwordEnabled = Boolean(passwordHash);
    const validation = validatePasswordEnrollmentInput(
        {
            newPassword: req.body?.newPassword ?? req.body?.password,
            confirmPassword: req.body?.confirmPassword,
            currentPassword: req.body?.currentPassword,
        },
        { passwordEnabled },
    );
    if (!validation.ok) {
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
        if (isPostgresConnection(connection)) {
            await updateUserPasswordAsync(connection, req.user.email, nextHash);
        } else {
            connection.database
                .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                .run(nextHash, userId);
        }
        syncUserPasswordCache(userId, nextHash);
        await refreshCachedAuthUser(connection, req.user.email);
        authLog('PASSWORD_ENROLL_SUCCESS', { userId, hadPassword: passwordEnabled });
        return res.json({
            message: passwordEnabled ? 'Password updated.' : 'Password created. You can sign in with email and password or Google.',
            passwordEnabled: true,
        });
    } catch (error) {
        authLog('PASSWORD_ENROLL_FAILED', { code: error.code || 'unknown' });
        return res.status(500).json({ message: 'Could not save your password. Please try again.' });
    }
};

module.exports = {
    getAccountSecurity,
    setAccountPassword,
};
