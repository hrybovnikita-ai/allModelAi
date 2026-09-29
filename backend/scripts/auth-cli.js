const { loadBackendEnv } = require('./load-backend-env');

function getProvider() {
    return require('../src/db/provider');
}

function parseEmailArg(argv) {
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg.startsWith('--email=')) {
            return arg.slice('--email='.length).trim().replace(/^['"]|['"]$/g, '');
        }
        if (arg === '--email') {
            const next = argv[index + 1];
            if (!next || next.startsWith('--')) {
                throw new Error('Missing value for --email. Use --email="user@example.com".');
            }
            return next.trim().replace(/^['"]|['"]$/g, '');
        }
    }
    throw new Error('Usage: --email="user@example.com"');
}

function parseAuthCliArgs(argv) {
    return {
        email: parseEmailArg(argv),
        requirePostgres: argv.includes('--require-postgres'),
    };
}

function printPostgresConfigurationHints() {
    loadBackendEnv();
    const { describeDatabaseUrlConfiguration } = getProvider();
    const status = describeDatabaseUrlConfiguration();
    if (status.misnamedEnvKeysIgnored.length) {
        console.error(
            `Unsupported database env variable name(s) ignored: ${status.misnamedEnvKeysIgnored.join(', ')}. `
            + 'Use DATABASE_URL only.',
        );
    }
    if (status.databaseUrlPlaceholder) {
        console.error(
            'DATABASE_URL in backend/.env is still a placeholder. '
            + 'Paste your Supabase Session pooler URI into DATABASE_URL and replace [YOUR-PASSWORD] locally.',
        );
    } else if (!status.databaseUrlConfigured) {
        console.error(
            'Set DATABASE_URL in backend/.env to the Supabase Session pooler URI (postgresql://...).',
        );
    }
}

function assertPostgresRequired(requirePostgres) {
    if (!requirePostgres) {
        return;
    }
    loadBackendEnv();
    const { getDatabaseEngine } = getProvider();
    if (getDatabaseEngine() !== 'postgres') {
        console.error('PostgreSQL required but not configured');
        printPostgresConfigurationHints();
        process.exit(1);
    }
}

function connectAuthDatabase() {
    loadBackendEnv();
    const { getDatabaseEngine } = getProvider();
    const engine = getDatabaseEngine();
    const { connectDatabase } = require('../src/db');
    const connection = connectDatabase();
    if (connection.engine && connection.engine !== engine) {
        throw new Error('Database engine mismatch during auth diagnostics.');
    }
    return { connection, engine: connection.engine || engine };
}

function describeDatabaseUrlConfiguration() {
    loadBackendEnv();
    return getProvider().describeDatabaseUrlConfiguration();
}

module.exports = {
    loadBackendEnv,
    parseAuthCliArgs,
    assertPostgresRequired,
    connectAuthDatabase,
    describeDatabaseUrlConfiguration,
    printPostgresConfigurationHints,
};
