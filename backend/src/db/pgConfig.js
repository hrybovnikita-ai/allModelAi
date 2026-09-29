const fs = require('node:fs');
const tls = require('node:tls');
const { Pool } = require('pg');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SSL_QUERY_PARAMS = [
    'sslmode',
    'sslrootcert',
    'sslcert',
    'sslkey',
    'uselibpqcompat',
    'sslnegotiation',
];

function toPostgresqlUrl(connectionString) {
    return connectionString.replace(/^postgres:\/\//i, 'postgresql://');
}

function toPostgresUrl(connectionString) {
    return connectionString.replace(/^postgresql:\/\//i, 'postgres://');
}

function parsePostgresUrl(connectionString) {
    return new URL(toPostgresqlUrl(connectionString));
}

function parsePostgresHost(connectionString) {
    try {
        return parsePostgresUrl(connectionString).hostname || '';
    } catch {
        return '';
    }
}

function isLocalPostgres(connectionString) {
    return LOCAL_HOSTS.has(parsePostgresHost(connectionString));
}

function readSslCaFile() {
    const caFile = process.env.DATABASE_SSL_CA_FILE?.trim();
    if (!caFile) {
        return null;
    }
    if (!fs.existsSync(caFile)) {
        throw new Error(
            'DATABASE_SSL_CA_FILE is set but the file was not found. '
            + 'Download the Supabase CA certificate from Database Settings → SSL Configuration.',
        );
    }
    return fs.readFileSync(caFile, 'utf8');
}

function stripSslQueryParams(connectionString) {
    const url = parsePostgresUrl(connectionString);
    for (const param of SSL_QUERY_PARAMS) {
        url.searchParams.delete(param);
    }
    const serialized = url.toString();
    return toPostgresUrl(serialized);
}

function sslModeFromConnectionString(connectionString) {
    try {
        const url = parsePostgresUrl(connectionString);
        return url.searchParams.get('sslmode')?.trim().toLowerCase() || null;
    } catch {
        return null;
    }
}

function resolveSslMode(connectionString) {
    const fromEnv = process.env.DATABASE_SSL_MODE?.trim().toLowerCase();
    if (fromEnv) {
        return fromEnv;
    }
    const fromUrl = sslModeFromConnectionString(connectionString);
    if (fromUrl === 'verify-full' || fromUrl === 'verify-ca') {
        if (!process.env.DATABASE_SSL_CA_FILE?.trim()) {
            return 'require';
        }
        return fromUrl;
    }
    if (fromUrl) {
        return fromUrl;
    }
    return 'require';
}

function buildSslForMode(sslMode) {
    if (sslMode === 'disable' || process.env.DATABASE_SSL === 'false') {
        return false;
    }

    const ca = readSslCaFile();
    const rejectUnauthorizedEnv = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase();

    switch (sslMode) {
        case 'no-verify':
            return { rejectUnauthorized: false };

        case 'require':
        case 'prefer':
            if (ca) {
                return {
                    ca,
                    rejectUnauthorized: true,
                    checkServerIdentity: tls.checkServerIdentity,
                };
            }
            if (rejectUnauthorizedEnv === 'true') {
                return { rejectUnauthorized: true };
            }
            return { rejectUnauthorized: false };

        case 'verify-ca':
            if (!ca) {
                throw new Error(
                    'sslmode=verify-ca requires DATABASE_SSL_CA_FILE pointing to the Supabase CA certificate '
                    + '(Database Settings → SSL Configuration → Download certificate).',
                );
            }
            return {
                ca,
                rejectUnauthorized: true,
                checkServerIdentity: () => undefined,
            };

        case 'verify-full':
            if (!ca) {
                throw new Error(
                    'DATABASE_SSL_MODE=verify-full requires DATABASE_SSL_CA_FILE pointing to the Supabase CA certificate '
                    + '(Database Settings → SSL Configuration → Download certificate).',
                );
            }
            return {
                ca,
                rejectUnauthorized: true,
                checkServerIdentity: tls.checkServerIdentity,
            };

        default:
            throw new Error(
                `Unsupported DATABASE_SSL_MODE or sslmode value "${sslMode}". `
                + 'Use require, verify-full, verify-ca, or no-verify.',
            );
    }
}

function getPgPoolConfig(connectionString) {
    if (isLocalPostgres(connectionString) && process.env.DATABASE_SSL !== 'true') {
        return {
            connectionString: stripSslQueryParams(connectionString),
            max: Number(process.env.DATABASE_POOL_MAX || 10),
            sslMode: 'disable',
        };
    }

    const sslMode = resolveSslMode(connectionString);
    const ssl = buildSslForMode(sslMode);
    const config = {
        connectionString: stripSslQueryParams(connectionString),
        max: Number(process.env.DATABASE_POOL_MAX || 10),
        sslMode,
    };

    if (ssl !== undefined) {
        config.ssl = ssl;
    }

    return config;
}

function createPgPool(connectionString) {
    const { sslMode, ...poolConfig } = getPgPoolConfig(connectionString);
    return new Pool(poolConfig);
}

function redactSecrets(text) {
    return String(text || '')
        .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[redacted-connection-uri]')
        .replace(/(password=)[^\s&'"]+/gi, '$1[redacted]')
        .replace(/(Password:\s*)[^\s'"]+/gi, '$1[redacted]');
}

function describePgFailure(error) {
    const code = error?.code;
    const message = redactSecrets(error?.message || 'unknown error');

    if (code === '28P01' || /password authentication failed/i.test(message)) {
        return {
            reason: 'authentication failed',
            hint: 'PostgreSQL authentication failed. Verify the Supabase database password and DATABASE_URL. '
                + 'Use the Session pooler URI from Supabase (pooler host, correct pooler username, URL-encoded password). '
                + 'After resetting the database password in Supabase, update DATABASE_URL on Render.',
        };
    }

    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return {
            reason: 'host lookup failed',
            hint: 'PostgreSQL host could not be resolved. Verify the Supabase pooler host in DATABASE_URL.',
        };
    }

    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT') {
        return {
            reason: 'connection failed',
            hint: 'PostgreSQL connection failed. Verify Supabase pooler host/port and network access.',
        };
    }

    if (/self signed certificate|certificate verify failed|tls certificate verification failed|unable to verify/i.test(message)) {
        return {
            reason: 'tls certificate verification failed',
            hint: 'PostgreSQL TLS verification failed. Remove sslmode from DATABASE_URL (the app configures TLS). '
                + 'For encrypted Supabase connections use DATABASE_SSL_MODE=require (default). '
                + 'For strict verification use DATABASE_SSL_MODE=verify-full with DATABASE_SSL_CA_FILE '
                + 'pointing to the Supabase CA from Database Settings → SSL Configuration.',
        };
    }

    return {
        reason: 'connection failed',
        hint: message,
    };
}

function formatSafePgFailure(error) {
    if (error?.message && !error.code) {
        return redactSecrets(error.message);
    }
    const failure = describePgFailure(error);
    return failure.hint;
}

async function verifyPostgresConnection(pool) {
    await pool.query('SELECT 1 AS ok');
    const usersTable = await pool.query(`
        SELECT 1 AS ok
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
        LIMIT 1
    `);
    return {
        connected: true,
        usersTablePresent: usersTable.rowCount > 0,
    };
}

module.exports = {
    SSL_QUERY_PARAMS,
    buildSslForMode,
    createPgPool,
    describePgFailure,
    formatSafePgFailure,
    getPgPoolConfig,
    isLocalPostgres,
    redactSecrets,
    resolveSslMode,
    sslModeFromConnectionString,
    stripSslQueryParams,
    verifyPostgresConnection,
};
