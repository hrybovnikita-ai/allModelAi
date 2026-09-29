const crypto = require('node:crypto');
const path = require('node:path');

function databaseFingerprint(database) {
    try {
        const stats = database.prepare('SELECT COUNT(*) AS userCount, MAX(id) AS maxUserId FROM users').get();
        const payload = `${stats.userCount}:${stats.maxUserId ?? 0}`;
        return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
    } catch {
        return 'unavailable';
    }
}

function logRuntimeDiagnostics({ databasePath, database }) {
    if (process.env.NODE_ENV === 'test') return;

    const runtime = {
        nodeEnv: process.env.NODE_ENV || 'development',
        vercel: Boolean(process.env.VERCEL),
        persistentBackendOrigin: Boolean(process.env.PERSISTENT_BACKEND_ORIGIN?.trim()),
        databaseEngine: 'sqlite',
        databasePath: databasePath ? path.resolve(databasePath) : 'unknown',
        databaseFingerprint: database ? databaseFingerprint(database) : 'unknown',
    };

    console.log('[RUNTIME] Authentication storage diagnostics');
    console.log(`[RUNTIME]   environment: ${runtime.nodeEnv}`);
    console.log(`[RUNTIME]   vercel proxy mode: ${runtime.vercel && !database ? 'yes' : 'no'}`);
    console.log(`[RUNTIME]   persistent backend configured: ${runtime.persistentBackendOrigin ? 'yes' : 'no'}`);
    if (database) {
        console.log(`[RUNTIME]   sqlite path: ${runtime.databasePath}`);
        console.log(`[RUNTIME]   database fingerprint: ${runtime.databaseFingerprint}`);
        console.log('[RUNTIME]   Compare fingerprint with production /api/health to confirm the same database.');
    } else if (runtime.vercel) {
        console.log('[RUNTIME]   this process proxies /api to PERSISTENT_BACKEND_ORIGIN (no local SQLite here)');
    }
}

module.exports = {
    databaseFingerprint,
    logRuntimeDiagnostics,
};
