const { getDatabaseEngine } = require('./provider');
const { redactSecrets } = require('./pgConfig');

function isPostgresDatabaseMode() {
    return getDatabaseEngine() === 'postgres';
}

function getTableColumnNames(database, tableName) {
    if (typeof database.pragma !== 'function') {
        throw new Error(`Cannot introspect table "${tableName}": database.pragma is unavailable.`);
    }
    const rows = database.pragma(`table_info(${tableName})`) || [];
    return rows.map((column) => column.name);
}

function logStartupSqlFailure(operation, error) {
    const safeMessage = redactSecrets(error?.message || 'unknown error');
    console.error('[STARTUP] SQL operation failed');
    console.error(`[STARTUP]   operation: ${operation}`);
    console.error(`[STARTUP]   code: ${error?.code || 'unknown'}`);
    console.error(`[STARTUP]   message: ${safeMessage}`);
}

module.exports = {
    getTableColumnNames,
    isPostgresDatabaseMode,
    logStartupSqlFailure,
};
