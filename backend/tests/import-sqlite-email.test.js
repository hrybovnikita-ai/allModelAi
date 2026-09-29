const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');
const {
    normalizeImportEmail,
    resolveSelectedUsers,
    parseArgs,
    buildEmailDryRunReport,
} = require('../scripts/import-sqlite-lib');

function createFixtureDb() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-import-email-'));
    const dbPath = path.join(directory, 'fixture.sqlite');
    const db = new Database(dbPath);
    db.exec(`
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            password_hash TEXT,
            email_verified INTEGER NOT NULL DEFAULT 0,
            role TEXT NOT NULL DEFAULT 'user',
            avatar_url TEXT
        );
        CREATE TABLE auth_sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        );
        CREATE TABLE subscriptions (
            email TEXT PRIMARY KEY,
            plan TEXT NOT NULL
        );
        CREATE TABLE subscription_details (
            email TEXT PRIMARY KEY,
            plan TEXT NOT NULL,
            billing_interval TEXT NOT NULL,
            request_limit INTEGER NOT NULL,
            period_end TEXT,
            stripe_customer_id TEXT,
            stripe_subscription_id TEXT,
            status TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            payment_provider TEXT,
            order_reference TEXT,
            payment_status TEXT,
            amount REAL,
            currency TEXT,
            activated_at TEXT
        );
    `);
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(
        9,
        'Real User',
        'Real.User@Example.COM',
        'salt:deadbeef',
    );
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(
        10,
        'Other',
        'other@example.com',
        null,
    );
    db.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run('hash-a', 9, Date.now() + 1000);
    db.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run('hash-b', 9, Date.now() + 2000);
    db.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run('hash-c', 10, Date.now() + 2000);
    db.prepare('INSERT INTO subscriptions (email, plan) VALUES (?, ?)').run('real.user@example.com', 'pro');
    db.prepare(`
        INSERT INTO subscription_details (
            email, plan, billing_interval, request_limit, status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('real.user@example.com', 'pro', 'month', 3000, 'active', new Date().toISOString());
    db.close();
    return { directory, dbPath };
}

test('normalizeImportEmail is case-insensitive', () => {
    assert.equal(normalizeImportEmail('Real.User@Example.COM'), 'real.user@example.com');
});

test('resolveSelectedUsers filters by exact email case-insensitively', () => {
    const users = [
        { id: 9, email: 'Real.User@Example.COM', password_hash: 'salt:abc' },
        { id: 10, email: 'other@example.com', password_hash: null },
    ];
    const selection = resolveSelectedUsers(users, { profile: 'production-worthy', email: 'real.user@example.com' });
    assert.equal(selection.status, 'ok');
    assert.equal(selection.selected.length, 1);
    assert.equal(selection.selected[0].id, 9);
});

test('resolveSelectedUsers returns not_found for unknown email', () => {
    const selection = resolveSelectedUsers([], { profile: 'production-worthy', email: 'missing@example.com' });
    assert.equal(selection.status, 'not_found');
    assert.equal(selection.selected.length, 0);
});

test('resolveSelectedUsers stops on ambiguous duplicate emails', () => {
    const users = [
        { id: 1, email: 'dup@test.com', password_hash: 'a' },
        { id: 2, email: 'DUP@test.com', password_hash: 'b' },
    ];
    const selection = resolveSelectedUsers(users, { profile: 'production-worthy', email: 'dup@test.com' });
    assert.equal(selection.status, 'ambiguous');
    assert.deepEqual(selection.duplicateIds, [1, 2]);
});

test('buildEmailDryRunReport never includes password hash value', () => {
    const report = buildEmailDryRunReport({
        args: { dryRun: true },
        selection: {
            status: 'ok',
            selected: [{ id: 9, email: 'user@test.com', password_hash: 'salt:secret' }],
            target: 'user@test.com',
        },
        authSessions: [{}, {}],
        subscriptions: [{}],
        subscriptionDetailsCount: 1,
    });
    assert.equal(report.passwordHashPresent, true);
    assert.equal(JSON.stringify(report).includes('salt:secret'), false);
    assert.equal(report.authSessionsCount, 2);
    assert.equal(report.subscriptionsCount, 1);
    assert.equal(report.subscriptionDetailsCount, 1);
});

test('email dry-run CLI selects one user and related rows without modifying sqlite', () => {
    const fixture = createFixtureDb();
    const before = fs.readFileSync(fixture.dbPath);
    const script = path.join(__dirname, '..', 'scripts', 'import-sqlite.js');
    const output = execFileSync(process.execPath, [
        script,
        '--dry-run',
        `--email=real.user@example.com`,
        `--sqlite=${fixture.dbPath}`,
    ], {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
    });
    const after = fs.readFileSync(fixture.dbPath);
    assert.equal(before.equals(after), true);
    const report = JSON.parse(output);
    assert.equal(report.mode, 'dry-run');
    assert.equal(report.selectedUserId, 9);
    assert.equal(report.selectedEmail, 'Real.User@Example.COM');
    assert.equal(report.passwordHashPresent, true);
    assert.equal(report.authSessionsCount, 2);
    assert.equal(report.subscriptionsCount, 1);
    assert.equal(output.includes('salt:'), false);
    fs.rmSync(fixture.directory, { recursive: true, force: true });
});

test('unknown email dry-run exits safely without postgres changes', () => {
    const fixture = createFixtureDb();
    const script = path.join(__dirname, '..', 'scripts', 'import-sqlite.js');
    const output = execFileSync(process.execPath, [
        script,
        '--dry-run',
        '--email=nobody@example.com',
        `--sqlite=${fixture.dbPath}`,
    ], {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
    });
    const report = JSON.parse(output);
    assert.equal(report.status, 'not_found');
    fs.rmSync(fixture.directory, { recursive: true, force: true });
});

test('parseArgs accepts --email="value" form', () => {
    const args = parseArgs(['--dry-run', '--email="single@test.com"'], '/tmp/x.sqlite');
    assert.equal(args.email, 'single@test.com');
});

test('email filter bypasses production-worthy profile limits', () => {
    const users = [
        { id: 99, email: 'demo@example.com', password_hash: 'salt:demo' },
    ];
    const selection = resolveSelectedUsers(users, {
        profile: 'production-worthy',
        email: 'demo@example.com',
    });
    assert.equal(selection.status, 'ok');
    assert.equal(selection.selected[0].id, 99);
});
