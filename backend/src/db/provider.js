const DATABASE_URL_ENV_KEYS = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_CONNECTION_STRING',
    'SUPABASE_DATABASE_URL',
];

function resolveDatabaseUrl() {
    for (const key of DATABASE_URL_ENV_KEYS) {
        const value = process.env[key]?.trim();
        if (value) {
            return { url: value, source: key };
        }
    }
    return null;
}

function getDatabaseEngine() {
    return resolveDatabaseUrl() ? 'postgres' : 'sqlite';
}

function isPostgres() {
    return getDatabaseEngine() === 'postgres';
}

function isProductionEnvironment() {
    return process.env.NODE_ENV === 'production';
}

function allowSqliteInProduction() {
    return process.env.ALLOW_SQLITE_PRODUCTION === 'true';
}

function assertProductionDatabasePolicy() {
    if (!isProductionEnvironment() || allowSqliteInProduction()) {
        return;
    }
    if (resolveDatabaseUrl()) {
        return;
    }
    throw new Error(
        'Production requires PostgreSQL. Set DATABASE_URL (Supabase Session Pooler URI) on the '
        + 'Render service. To intentionally use SQLite in production, set ALLOW_SQLITE_PRODUCTION=true.',
    );
}

function requireDatabaseUrl() {
    const resolved = resolveDatabaseUrl();
    if (!resolved) {
        throw new Error(
            'DATABASE_URL is required for this command (also accepts POSTGRES_URL or SUPABASE_DATABASE_URL).',
        );
    }
    return resolved.url;
}

function databaseUrlConfigured() {
    return Boolean(resolveDatabaseUrl());
}

module.exports = {
    DATABASE_URL_ENV_KEYS,
    resolveDatabaseUrl,
    getDatabaseEngine,
    isPostgres,
    isProductionEnvironment,
    allowSqliteInProduction,
    assertProductionDatabasePolicy,
    requireDatabaseUrl,
    databaseUrlConfigured,
};
