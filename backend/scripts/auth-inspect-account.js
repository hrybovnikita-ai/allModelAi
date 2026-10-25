#!/usr/bin/env node
/**
 * Safe account inspection (no email/password/hash in output).
 * Usage: node scripts/auth-inspect-account.js --email="you@example.com"
 */
const { normalizeLoginEmail } = require('../src/authHelpers');
const { loadAuthUserByEmailAsync } = require('../src/authUser');
const { isValidPasswordHashFormat } = require('../src/authPasswordHash');
const {
    parseAuthCliArgs,
    connectAuthDatabase,
} = require('./auth-cli');
const { isPostgresConnection } = require('../src/db/postgresHttpReads');
const { userHasSocialIdentityAsync } = require('../src/db/postgresHttpAuth');

async function main() {
    const { email: emailArg } = parseAuthCliArgs(process.argv.slice(2));
    const normalizedEmail = normalizeLoginEmail(emailArg);
    const { connection, engine } = connectAuthDatabase();

    try {
        const user = await loadAuthUserByEmailAsync(connection, normalizedEmail);
        let hasSocialIdentity = false;
        if (user?.id) {
            if (isPostgresConnection(connection)) {
                hasSocialIdentity = await userHasSocialIdentityAsync(connection, user.id);
            } else {
                hasSocialIdentity = Boolean(
                    connection.database
                        .prepare('SELECT 1 AS ok FROM social_identities WHERE user_id = ? LIMIT 1')
                        .get(user.id),
                );
            }
        }
        const hash = user?.passwordHash || null;
        console.log(JSON.stringify({
            databaseEngine: engine,
            accountExists: Boolean(user),
            passwordHashPresent: Boolean(hash),
            passwordHashValidFormat: isValidPasswordHashFormat(hash),
            socialIdentityLinked: hasSocialIdentity,
            localPasswordLoginReady: Boolean(hash && isValidPasswordHashFormat(hash)),
            recommendedAction: !user
                ? 'REGISTER_OR_CHECK_EMAIL'
                : (hash && isValidPasswordHashFormat(hash))
                    ? 'EMAIL_PASSWORD_LOGIN'
                    : hasSocialIdentity
                        ? 'GOOGLE_SIGN_IN_OR_FORGOT_PASSWORD'
                        : 'FORGOT_PASSWORD_TO_SET_PASSWORD',
        }, null, 2));
    } finally {
        connection.close();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
