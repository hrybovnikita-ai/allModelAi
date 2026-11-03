const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { upsertSqliteUser } = require('../scripts/sqlite-user-backfill');

function createMockClient(state) {
    return {
        async query(sql, values) {
            const text = String(sql);
            if (/SELECT id, password_hash FROM users/i.test(text)) {
                const email = values[0];
                const row = state.users.get(email);
                return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
            }
            if (/INSERT INTO users/i.test(text)) {
                const email = values[1];
                const existing = state.users.get(email);
                const incoming = {
                    id: existing?.id ?? state.nextId++,
                    password_hash: values[2],
                };
                if (!existing) {
                    state.users.set(email, incoming);
                } else if (!String(existing.password_hash || '').trim() && values[2]) {
                    existing.password_hash = values[2];
                }
                return { rowCount: 1, rows: [] };
            }
            throw new Error(`Unexpected query: ${text.slice(0, 80)}`);
        },
    };
}

test('upsertSqliteUser backfills missing password hash without overwriting existing hash', async () => {
    const email = 'legacy@test.com';
    const state = {
        nextId: 2,
        users: new Map([
            [email, { id: 1, password_hash: '' }],
        ]),
    };
    const client = createMockClient(state);

    const first = await upsertSqliteUser(client, {
        name: 'Legacy',
        email: 'Legacy@test.com',
        password_hash: 'salt:abc123',
        email_verified: 1,
        role: 'user',
        avatar_url: null,
    });
    assert.equal(first.action, 'backfilled_password');
    assert.equal(state.users.get(email).password_hash, 'salt:abc123');

    const second = await upsertSqliteUser(client, {
        name: 'Legacy',
        email: email,
        password_hash: 'salt:other',
        email_verified: 1,
        role: 'user',
        avatar_url: null,
    });
    assert.equal(second.action, 'unchanged');
    assert.equal(state.users.get(email).password_hash, 'salt:abc123');
});

test('backfill reads sqlite fixture users without printing password hashes', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-backfill-'));
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
    `);
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(
        1,
        'Real',
        'real.user@example.com',
        'salt:deadbeef',
    );
    db.close();

    const { loadSqliteUsers } = {
        loadSqliteUsers: (sqlitePath) => {
            const sqlite = new Database(sqlitePath, { readonly: true });
            try {
                return sqlite.prepare('SELECT id, name, email, password_hash FROM users').all();
            } finally {
                sqlite.close();
            }
        },
    };
    const rows = loadSqliteUsers(dbPath);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, 'real.user@example.com');
    fs.rmSync(directory, { recursive: true, force: true });
});
