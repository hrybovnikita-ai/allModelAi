const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    getDatabaseEngine,
    isValidPostgresConnectionUrl,
    resolveDatabaseUrl,
    getMisnamedDatabaseEnvKeys,
} = require('../src/db/provider');

const snapshot = {};

afterEach(() => {
    for (const key of Object.keys(process.env)) {
        if (key.startsWith('DATABASE_') || key.startsWith('POSTGRES') || key.startsWith('SUPABASE_')) {
            if (snapshot[key] === undefined) delete process.env[key];
            else process.env[key] = snapshot[key];
        }
    }
    delete require.cache[require.resolve('../src/db/provider')];
});

test('placeholder DATABASE_URL is not treated as configured postgres', () => {
    process.env.DATABASE_URL = 'YOUR_SUPABASE_SESSION_POOLER_URI';
    assert.equal(isValidPostgresConnectionUrl(process.env.DATABASE_URL), false);
    assert.equal(getDatabaseEngine(), 'sqlite');
});

test('postgresql URI with [YOUR-PASSWORD] placeholder is rejected', () => {
    const url = 'postgresql://postgres.project:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
    assert.equal(isValidPostgresConnectionUrl(url), false);
    assert.equal(resolveDatabaseUrl(), null);
});

test('valid postgres connection string enables postgres engine', () => {
    process.env.DATABASE_URL = 'postgresql://user:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
    assert.equal(getDatabaseEngine(), 'postgres');
    assert.equal(resolveDatabaseUrl()?.source, 'DATABASE_URL');
    delete process.env.DATABASE_URL;
});

test('misnamed database env keys are reported without being used', () => {
    delete process.env.DATABASE_URL;
    process.env.DATABASE_URL_API_KEY = 'postgresql://user:secret@host:5432/postgres';
    assert.equal(getDatabaseEngine(), 'sqlite');
    assert.deepEqual(getMisnamedDatabaseEnvKeys(), ['DATABASE_URL_API_KEY']);
    delete process.env.DATABASE_URL_API_KEY;
});
