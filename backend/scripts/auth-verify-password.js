#!/usr/bin/env node
const readline = require('node:readline');
const { normalizeLoginEmail } = require('../src/authHelpers');
const { verifyPassword } = require('../src/password');
const { loadAuthUserByEmail } = require('../src/authUser');
const {
    loadBackendEnv,
    parseAuthCliArgs,
    assertPostgresRequired,
    connectAuthDatabase,
} = require('./auth-cli');

function readPasswordSecurely(prompt) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
        });
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

async function main() {
    loadBackendEnv();
    const { email: emailArg, requirePostgres } = parseAuthCliArgs(process.argv.slice(2));
    assertPostgresRequired(requirePostgres);

    const normalizedEmail = normalizeLoginEmail(emailArg);
    const { connection } = connectAuthDatabase();

    try {
        const user = loadAuthUserByEmail(connection.database, normalizedEmail);
        if (!user) {
            console.log('Password verification: failed');
            console.log('Reason: USER_NOT_FOUND');
            process.exitCode = 2;
            return;
        }
        if (!user.passwordHash) {
            console.log('Password verification: failed');
            console.log('Reason: PASSWORD_HASH_MISSING');
            process.exitCode = 2;
            return;
        }
        const password = await readPasswordSecurely('Password: ');
        const matches = await verifyPassword(password, user.passwordHash);
        console.log(matches ? 'Password verification: success' : 'Password verification: failed');
        if (!matches) {
            console.log('Reason: PASSWORD_MISMATCH');
            process.exitCode = 2;
        }
    } finally {
        connection.close();
    }
}

main().catch((error) => {
    console.error('Password verification: failed');
    console.error(`Reason: ${error.code || 'VERIFY_ERROR'}`);
    process.exit(1);
});
