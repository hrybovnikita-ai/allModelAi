const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');

function createProductionDryRunFixture() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-import-dry-run-'));
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
    `);

    let id = 1;
    const insertUser = db.prepare(
        'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)',
    );

    for (let i = 0; i < 12; i += 1) {
        insertUser.run(id, `Example ${id}`, `user${id}@example.com`, null);
        id += 1;
    }

    const productionEmails = [
        'alice.production@gmail.com',
        'bob.owner@all-model-ai.com',
        'carol.real@outlook.com',
    ];
    for (const email of productionEmails) {
        insertUser.run(id, `Prod ${id}`, email, 'salt:fixture-only');
        db.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
            `hash-${id}`,
            id,
            Date.now() + 3600_000,
        );
        db.prepare('INSERT INTO subscriptions (email, plan) VALUES (?, ?)').run(
            email.toLowerCase(),
            'pro',
        );
        id += 1;
    }

    insertUser.run(id, 'Test domain', 'legacy@test.com', null);
    id += 1;
    insertUser.run(id, 'WFP debug', 'wfpdbg001@mail.com', null);
    id += 1;
    insertUser.run(id, 'Live checkout', 'live1@ex.com', null);
    id += 1;

    const usersInSqlite = id - 1;
    db.close();
    return {
        directory,
        dbPath,
        totals: {
            usersInSqlite,
            usersSelected: productionEmails.length,
            testExampleDomain: 12,
            productionEmails,
        },
    };
}

function runImportDryRun(dbPath, extraArgs = []) {
    const script = path.join(__dirname, '..', 'scripts', 'import-sqlite.js');
    return execFileSync(
        process.execPath,
        [script, '--dry-run', `--sqlite=${dbPath}`, ...extraArgs],
        {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf8',
            env: { ...process.env, DATABASE_URL: '' },
        },
    );
}

test('sqlite import dry-run reports production-worthy users without DATABASE_URL', () => {
    const fixture = createProductionDryRunFixture();
    try {
        const output = runImportDryRun(fixture.dbPath);
        const report = JSON.parse(output);
        assert.equal(report.mode, 'dry-run');
        assert.equal(report.totals.usersInSqlite, fixture.totals.usersInSqlite);
        assert.equal(report.totals.usersSelected, fixture.totals.usersSelected);
        assert.equal(report.userBuckets.test_example_domain, fixture.totals.testExampleDomain);
        assert.equal(report.userBuckets.production_worthy, fixture.totals.usersSelected);
        for (const email of fixture.totals.productionEmails) {
            assert.ok(
                report.selectedEmails.some(
                    (value) => String(value).toLowerCase() === email.toLowerCase(),
                ),
                `expected selectedEmails to include ${email}`,
            );
        }
        assert.equal(report.totals.authSessionsSelected, fixture.totals.usersSelected);
        assert.equal(report.totals.subscriptionsSelected, fixture.totals.usersSelected);
        assert.equal(output.includes('salt:'), false);
    } finally {
        fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
});

test('sqlite import dry-run accepts SQLITE_IMPORT_PATH when --sqlite is omitted', () => {
    const fixture = createProductionDryRunFixture();
    try {
        const script = path.join(__dirname, '..', 'scripts', 'import-sqlite.js');
        const output = execFileSync(process.execPath, [script, '--dry-run'], {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf8',
            env: {
                ...process.env,
                DATABASE_URL: '',
                SQLITE_IMPORT_PATH: fixture.dbPath,
            },
        });
        const report = JSON.parse(output);
        assert.equal(report.mode, 'dry-run');
        assert.equal(report.totals.usersSelected, fixture.totals.usersSelected);
        assert.equal(report.sqlitePath, path.resolve(fixture.dbPath));
    } finally {
        fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
});

test('sqlite import dry-run fails clearly when sqlite file is missing', () => {
    const missing = path.join(os.tmpdir(), `allmodelai-missing-${Date.now()}.sqlite`);
    assert.throws(
        () => runImportDryRun(missing),
        (error) => /SQLite file not found/i.test(String(error.stderr || error.message)),
    );
});
