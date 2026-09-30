const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    buildSslForMode,
    describePgFailure,
    getPgPoolConfig,
    redactSecrets,
    resolveSslMode,
    stripSslQueryParams,
} = require('../src/db/pgConfig');

const remoteUrl = 'postgresql://user:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres';

test('stripSslQueryParams removes sslmode so pg Pool ssl is not overridden', () => {
    const url = `${remoteUrl}?sslmode=require`;
    const stripped = stripSslQueryParams(url);
    assert.doesNotMatch(stripped, /sslmode=/);
    assert.match(stripped, /pooler\.supabase\.com/);
});

test('resolveSslMode prefers DATABASE_SSL_MODE over URL sslmode', () => {
    process.env.DATABASE_SSL_MODE = 'verify-full';
    const mode = resolveSslMode(`${remoteUrl}?sslmode=require`);
    assert.equal(mode, 'verify-full');
    delete process.env.DATABASE_SSL_MODE;
});

test('URL sslmode=verify-full without CA falls back to require TLS config', () => {
    delete process.env.DATABASE_SSL_MODE;
    delete process.env.DATABASE_SSL_CA_FILE;
    delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
    const config = getPgPoolConfig(`${remoteUrl}?sslmode=verify-full`);
    assert.equal(config.sslMode, 'require');
    assert.doesNotMatch(config.connectionString, /sslmode=/);
    assert.deepEqual(config.ssl, { rejectUnauthorized: false });
});

test('getPgPoolConfig sets connection and idle timeouts for remote postgres', () => {
    delete process.env.DATABASE_CONNECTION_TIMEOUT_MS;
    delete process.env.DATABASE_IDLE_TIMEOUT_MS;
    const config = getPgPoolConfig(remoteUrl);
    assert.equal(config.connectionTimeoutMillis, 10_000);
    assert.equal(config.idleTimeoutMillis, 30_000);
    assert.equal(config.keepAlive, true);
});

test('createAuthPgPool uses smaller max pool size by default', () => {
    const { createAuthPgPool } = require('../src/db/pgConfig');
    delete process.env.DATABASE_AUTH_POOL_MAX;
    delete process.env.DATABASE_QUERY_TIMEOUT_MS;
    const pool = createAuthPgPool(remoteUrl);
    assert.equal(pool.options.max, 4);
    assert.equal(pool.options.query_timeout, 15_000);
    assert.equal(pool.options.statement_timeout, 15_000);
    pool.end().catch(() => {});
});

test('getPgPoolConfig require mode encrypts without URL sslmode override', () => {
    delete process.env.DATABASE_SSL_MODE;
    delete process.env.DATABASE_SSL_CA_FILE;
    delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
    const config = getPgPoolConfig(`${remoteUrl}?sslmode=require`);
    assert.equal(config.sslMode, 'require');
    assert.deepEqual(config.ssl, { rejectUnauthorized: false });
    assert.doesNotMatch(config.connectionString, /sslmode=/);
});

test('DATABASE_SSL_REJECT_UNAUTHORIZED=true enables CA verification for require mode', () => {
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = 'true';
    const config = getPgPoolConfig(remoteUrl);
    assert.deepEqual(config.ssl, { rejectUnauthorized: true });
    delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
});

test('explicit verify-full requires DATABASE_SSL_CA_FILE', () => {
    process.env.DATABASE_SSL_MODE = 'verify-full';
    delete process.env.DATABASE_SSL_CA_FILE;
    assert.throws(
        () => getPgPoolConfig(remoteUrl),
        /DATABASE_SSL_CA_FILE|Supabase CA/,
    );
    delete process.env.DATABASE_SSL_MODE;
});

test('verify-full with CA file uses secure tls settings', () => {
    const caPath = path.join(os.tmpdir(), `supabase-ca-${process.pid}.pem`);
    fs.writeFileSync(caPath, '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n');
    process.env.DATABASE_SSL_MODE = 'verify-full';
    process.env.DATABASE_SSL_CA_FILE = caPath;
    const config = getPgPoolConfig(remoteUrl);
    assert.equal(config.ssl.ca.includes('BEGIN CERTIFICATE'), true);
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.equal(typeof config.ssl.checkServerIdentity, 'function');
    delete process.env.DATABASE_SSL_MODE;
    delete process.env.DATABASE_SSL_CA_FILE;
    fs.rmSync(caPath, { force: true });
});

test('buildSslForMode no-verify keeps TLS with rejectUnauthorized false', () => {
    assert.deepEqual(buildSslForMode('no-verify'), { rejectUnauthorized: false });
});

test('describePgFailure maps authentication errors safely', () => {
    const failure = describePgFailure({ code: '28P01', message: 'password authentication failed for user "postgres"' });
    assert.equal(failure.reason, 'authentication failed');
    assert.match(failure.hint, /Verify the Supabase database password/);
    assert.doesNotMatch(failure.hint, /postgresql:\/\//);
});

test('describePgFailure maps tls errors to sslmode guidance', () => {
    const failure = describePgFailure({ message: 'TLS certificate verification failed' });
    assert.equal(failure.reason, 'tls certificate verification failed');
    assert.match(failure.hint, /DATABASE_SSL_MODE=require/);
    assert.match(failure.hint, /DATABASE_SSL_CA_FILE/);
});

test('redactSecrets removes connection URIs from messages', () => {
    const sanitized = redactSecrets('failed for postgresql://postgres:secret@host:5432/postgres');
    assert.match(sanitized, /\[redacted-connection-uri\]/);
    assert.doesNotMatch(sanitized, /secret/);
});
