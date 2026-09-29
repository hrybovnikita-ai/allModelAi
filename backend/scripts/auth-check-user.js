#!/usr/bin/env node
const { normalizeLoginEmail } = require('../src/authHelpers');
const { loadAuthUserByEmail } = require('../src/authUser');
const {
    classifyPasswordHashType,
    isValidPasswordHashFormat,
} = require('../src/authPasswordHash');
const {
    parseAuthCliArgs,
    assertPostgresRequired,
    connectAuthDatabase,
    loadBackendEnv,
} = require('./auth-cli');

async function main() {
    loadBackendEnv();
    const { email: emailArg, requirePostgres } = parseAuthCliArgs(process.argv.slice(2));
    assertPostgresRequired(requirePostgres);

    const normalizedEmail = normalizeLoginEmail(emailArg);
    const { connection, engine } = connectAuthDatabase();

    try {
        const user = loadAuthUserByEmail(connection.database, normalizedEmail);
        const passwordHash = user?.passwordHash || null;
        const hashType = classifyPasswordHashType(passwordHash);
        console.log(JSON.stringify({
            databaseEngine: engine,
            userFound: Boolean(user),
            emailNormalized: Boolean(normalizedEmail),
            passwordHashPresent: Boolean(passwordHash),
            passwordHashType: hashType,
            passwordHashValidFormat: isValidPasswordHashFormat(passwordHash),
        }, null, 2));
    } finally {
        connection.close();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
