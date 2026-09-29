const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

const envSnapshot = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    POSTGRES_URL: process.env.POSTGRES_URL,
    ALLOW_SQLITE_PRODUCTION: process.env.ALLOW_SQLITE_PRODUCTION,
    DB_FILE: process.env.DB_FILE,
};

afterEach(() => {
    process.env.NODE_ENV = envSnapshot.NODE_ENV;
    if (envSnapshot.DATABASE_URL) {
        process.env.DATABASE_URL = envSnapshot.DATABASE_URL;
    } else {
        delete process.env.DATABASE_URL;
    }
    delete process.env.POSTGRES_URL;
    if (envSnapshot.ALLOW_SQLITE_PRODUCTION) {
        process.env.ALLOW_SQLITE_PRODUCTION = envSnapshot.ALLOW_SQLITE_PRODUCTION;
    } else {
        delete process.env.ALLOW_SQLITE_PRODUCTION;
    }
    if (envSnapshot.DB_FILE) {
        process.env.DB_FILE = envSnapshot.DB_FILE;
    }
    delete require.cache[require.resolve('../src/db')];
    delete require.cache[require.resolve('../src/db/provider')];
});

test('production refuses SQLite when DATABASE_URL is not configured', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    delete process.env.ALLOW_SQLITE_PRODUCTION;
    process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-prod-guard-${process.pid}.sqlite`);
    assert.throws(
        () => require('../src/db').connectDatabase(),
        /Production requires PostgreSQL/,
    );
});

test('production allows SQLite only when ALLOW_SQLITE_PRODUCTION=true', () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_SQLITE_PRODUCTION = 'true';
    delete process.env.DATABASE_URL;
    const { assertProductionDatabasePolicy } = require('../src/db/provider');
    assert.doesNotThrow(() => assertProductionDatabasePolicy());
    process.env.NODE_ENV = 'production';
    assert.doesNotThrow(() => assertProductionDatabasePolicy());
});

test('resolveDatabaseUrl accepts POSTGRES_URL alias', () => {
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_URL = 'postgresql://example.invalid/db';
    const { resolveDatabaseUrl, getDatabaseEngine } = require('../src/db/provider');
    assert.equal(resolveDatabaseUrl()?.source, 'POSTGRES_URL');
    assert.equal(getDatabaseEngine(), 'postgres');
    delete process.env.POSTGRES_URL;
});
