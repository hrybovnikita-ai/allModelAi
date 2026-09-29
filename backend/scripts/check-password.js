#!/usr/bin/env node
/**
 * Safe local password check against the configured SQLite database.
 * Usage: node scripts/check-password.js hrybovnikita@gmail.com
 */
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const { normalizeLoginEmail } = require('../src/authHelpers');
const { verifyPassword } = require('../src/password');

const emailArg = process.argv[2];
if (!emailArg) {
    console.error('Usage: node scripts/check-password.js <email>');
    process.exit(1);
}

try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

const email = normalizeLoginEmail(emailArg);
const Database = require('better-sqlite3');
const dbPath = process.env.DB_FILE
    ? path.resolve(__dirname, '..', process.env.DB_FILE)
    : path.join(__dirname, '..', 'storage', 'database.sqlite');

if (!fs.existsSync(dbPath)) {
    console.error('Database file not found.');
    process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
const row = db.prepare(
    'SELECT password_hash FROM users WHERE lower(email) = ?',
).get(email);

if (!row) {
    console.log('ACCOUNT NOT FOUND');
    process.exit(0);
}

console.log('ACCOUNT FOUND');

if (!row.password_hash) {
    console.log('PASSWORD DOES NOT MATCH');
    console.log('(Account has no password — use social sign-in or password reset.)');
    process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Password: ', async (password) => {
    rl.close();
    try {
        const matches = await verifyPassword(password, row.password_hash);
        console.log(matches ? 'PASSWORD MATCHES' : 'PASSWORD DOES NOT MATCH');
        process.exit(matches ? 0 : 2);
    } catch (error) {
        console.error('Verification failed:', error.message);
        process.exit(1);
    } finally {
        db.close();
    }
});
