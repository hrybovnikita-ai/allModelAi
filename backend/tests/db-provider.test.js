const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

const originalDatabaseUrl = process.env.DATABASE_URL;

after(() => {
    if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
        delete process.env.DATABASE_URL;
    }
});

test('database engine is sqlite when DATABASE_URL is unset', () => {
    delete process.env.DATABASE_URL;
    const { getDatabaseEngine } = require('../src/db/provider');
    assert.equal(getDatabaseEngine(), 'sqlite');
});

test('database engine is postgres when DATABASE_URL is set', () => {
    delete require.cache[require.resolve('../src/db/provider')];
    process.env.DATABASE_URL = 'postgresql://example.invalid/db';
    const { getDatabaseEngine, databaseUrlConfigured } = require('../src/db/provider');
    assert.equal(getDatabaseEngine(), 'postgres');
    assert.equal(databaseUrlConfigured(), true);
    delete process.env.DATABASE_URL;
});

test('tests refuse PostgreSQL unless ALLOW_POSTGRES_TESTS=true', () => {
    process.env.DATABASE_URL = 'postgresql://example.invalid/db';
    process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-pg-guard-${process.pid}.sqlite`);
    delete require.cache[require.resolve('../src/db')];
    assert.throws(
        () => require('../src/db').connectDatabase(),
        /Refusing to run tests against PostgreSQL/,
    );
    delete process.env.DATABASE_URL;
});
