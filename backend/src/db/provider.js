const DATABASE_URL_ENV_KEYS = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_CONNECTION_STRING',
    'SUPABASE_DATABASE_URL',
];

const IGNORED_MISNAMED_DATABASE_ENV_KEYS = [
    'DATABASE_URL_API_KEY',
    'POSTGRES_URL_API_KEY',
    'POSTGRESS_URL_API_KEY',
];

const PLACEHOLDER_PATTERNS = [
    /YOUR_SUPABASE_SESSION_POOLER_URI/i,
    /YOUR[-_]SUPABASE/i,
    /\[YOUR-PASSWORD\]/i,
    /REPLACE_ME/i,
    /CHANGEME/i,
];

function isValidPostgresConnectionUrl(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
        return false;
    }
    if (!/^postgres(ql)?:\/\//i.test(trimmed)) {
        return false;
    }
    if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed))) {
        return false;
    }
    return true;
}

function resolveDatabaseUrl() {
    for (const key of DATABASE_URL_ENV_KEYS) {
        const value = process.env[key]?.trim();
        if (value && isValidPostgresConnectionUrl(value)) {
            return { url: value, source: key };
        }
    }
    return null;
}

function getMisnamedDatabaseEnvKeys() {
    return IGNORED_MISNAMED_DATABASE_ENV_KEYS.filter((key) => process.env[key]?.trim());
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

function describeDatabaseUrlConfiguration() {
    const misnamed = getMisnamedDatabaseEnvKeys();
    const rawDatabaseUrl = process.env.DATABASE_URL?.trim() || '';
    const placeholderDatabaseUrl = Boolean(
        rawDatabaseUrl
        && (!isValidPostgresConnectionUrl(rawDatabaseUrl)
            || PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(rawDatabaseUrl))),
    );
    const resolved = resolveDatabaseUrl();
    return {
        databaseEngine: getDatabaseEngine(),
        databaseUrlConfigured: Boolean(resolved),
        configuredFrom: resolved?.source || null,
        misnamedEnvKeysIgnored: misnamed,
        databaseUrlPlaceholder: placeholderDatabaseUrl,
    };
}

module.exports = {
    DATABASE_URL_ENV_KEYS,
    IGNORED_MISNAMED_DATABASE_ENV_KEYS,
    isValidPostgresConnectionUrl,
    resolveDatabaseUrl,
    getMisnamedDatabaseEnvKeys,
    getDatabaseEngine,
    isPostgres,
    isProductionEnvironment,
    allowSqliteInProduction,
    assertProductionDatabasePolicy,
    requireDatabaseUrl,
    databaseUrlConfigured,
    describeDatabaseUrlConfiguration,
};
