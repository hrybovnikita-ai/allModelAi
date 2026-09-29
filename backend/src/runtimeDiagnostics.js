const crypto = require('node:crypto');
const path = require('node:path');
const { databaseUrlConfigured } = require('./db/provider');

function databaseFingerprint(database) {
    try {
        const stats = database.prepare('SELECT COUNT(*) AS userCount, MAX(id) AS maxUserId FROM users').get();
        const payload = `${stats.userCount}:${stats.maxUserId ?? 0}`;
        return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
    } catch {
        return 'unavailable';
    }
}

function verifyDatabaseConnection(database) {
    try {
        database.prepare('SELECT 1 AS ok').get();
        return true;
    } catch {
        return false;
    }
}

function logRuntimeDiagnostics({
    databasePath,
    database,
    databaseEngine = 'sqlite',
    databaseConnected = null,
}) {
    if (process.env.NODE_ENV === 'test') return;

    const connected = databaseConnected ?? (database ? verifyDatabaseConnection(database) : false);
    const runtime = {
        nodeEnv: process.env.NODE_ENV || 'development',
        vercel: Boolean(process.env.VERCEL),
        persistentBackendOrigin: Boolean(process.env.PERSISTENT_BACKEND_ORIGIN?.trim()),
        databaseEngine,
        databasePath: databasePath ? path.resolve(databasePath) : 'unknown',
        databaseFingerprint: database && connected ? databaseFingerprint(database) : 'unavailable',
        databaseUrlConfigured: databaseUrlConfigured(),
    };

    console.log('[RUNTIME] Authentication storage diagnostics');
    console.log(`[RUNTIME]   environment: ${runtime.nodeEnv}`);
    console.log(`[RUNTIME]   vercel proxy mode: ${runtime.vercel && !database ? 'yes' : 'no'}`);
    console.log(`[RUNTIME]   persistent backend configured: ${runtime.persistentBackendOrigin ? 'yes' : 'no'}`);
    console.log(`[RUNTIME]   DATABASE_URL configured: ${runtime.databaseUrlConfigured ? 'yes' : 'no'}`);
    console.log(`[RUNTIME] database engine: ${runtime.databaseEngine}`);
    console.log(`[RUNTIME] database connected: ${connected ? 'true' : 'false'}`);

    if (database && connected) {
        if (runtime.databaseEngine === 'postgres') {
            console.log('[RUNTIME]   storage: PostgreSQL (DATABASE_URL or alias)');
        } else {
            console.log(`[RUNTIME]   sqlite path: ${runtime.databasePath}`);
        }
        console.log(`[RUNTIME]   database fingerprint: ${runtime.databaseFingerprint}`);
        console.log('[RUNTIME]   Compare fingerprint with production /api/health to confirm the same database.');
    } else if (runtime.vercel) {
        console.log('[RUNTIME]   this process proxies /api to PERSISTENT_BACKEND_ORIGIN (no local SQLite here)');
    } else if (runtime.databaseEngine === 'postgres' && !connected) {
        console.log('[RUNTIME]   PostgreSQL is configured but the connection check failed.');
    }
}

module.exports = {
    databaseFingerprint,
    verifyDatabaseConnection,
    logRuntimeDiagnostics,
};
