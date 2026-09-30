const DEFAULT_QUERY_TIMEOUT_MS = Number(process.env.DATABASE_QUERY_TIMEOUT_MS || 15000);
/** Extra HTTP guard after node-postgres query_timeout (does not cancel the query by itself). */
const QUERY_GUARD_GRACE_MS = Number(process.env.DATABASE_QUERY_GUARD_GRACE_MS || 500);

function describePgPoolStats(pool) {
    if (!pool) {
        return { totalCount: null, idleCount: null, waitingCount: null };
    }
    return {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
    };
}

function normalizePgTimeoutError(error) {
    if (!error) return error;
    if (isPgTimeoutError(error) && !error.code) {
        error.code = 'PG_QUERY_TIMEOUT';
    }
    return error;
}

function isPgTimeoutError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === 'PG_QUERY_TIMEOUT'
        || code === 'ETIMEDOUT'
        || code === '57014'
        || /query read timeout/i.test(message)
        || /timeout/i.test(message);
}

function buildQueryConfig(text, values, timeoutMs) {
    if (typeof text === 'object' && text !== null) {
        return {
            ...text,
            query_timeout: text.query_timeout ?? timeoutMs,
        };
    }
    return {
        text,
        values,
        query_timeout: timeoutMs,
    };
}

/**
 * Auth-safe PostgreSQL query with node-postgres query_timeout (cancels query + releases client)
 * and a short Promise.race guard for hung drivers/mocks only.
 */
async function queryPgPool(pool, text, values = [], { timeoutMs = DEFAULT_QUERY_TIMEOUT_MS } = {}) {
    if (!pool) {
        throw new Error('PostgreSQL pool is unavailable.');
    }

    const queryConfig = buildQueryConfig(text, values, timeoutMs);
    const queryPromise = pool.query(queryConfig).catch((error) => {
        throw normalizePgTimeoutError(error);
    });

    let guardTimer;
    const guardPromise = new Promise((_, reject) => {
        guardTimer = setTimeout(() => {
            const error = new Error('PostgreSQL query timeout');
            error.code = 'PG_QUERY_TIMEOUT';
            reject(error);
        }, timeoutMs + QUERY_GUARD_GRACE_MS);
    });

    try {
        return await Promise.race([queryPromise, guardPromise]);
    } finally {
        clearTimeout(guardTimer);
        queryPromise.catch(() => {});
    }
}

async function withPgTransaction(pool, fn) {
    if (!pool?.connect) {
        throw new Error('PostgreSQL pool does not support transactions.');
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            /* ignore rollback failure */
        }
        throw error;
    } finally {
        client.release();
    }
}

async function queryPgClient(client, text, values = [], { timeoutMs = DEFAULT_QUERY_TIMEOUT_MS } = {}) {
    const queryConfig = buildQueryConfig(text, values, timeoutMs);
    return client.query(queryConfig);
}

function resolvePostgresAsyncPool(connection) {
    if (!connection) return null;
    if (connection.pgAsyncPool) return connection.pgAsyncPool;
    const engine = connection.engine || 'sqlite';
    if (engine !== 'postgres') return null;
    return connection.database?.pool || null;
}

module.exports = {
    DEFAULT_QUERY_TIMEOUT_MS,
    QUERY_GUARD_GRACE_MS,
    describePgPoolStats,
    isPgTimeoutError,
    queryPgPool,
    queryPgClient,
    withPgTransaction,
    resolvePostgresAsyncPool,
    buildQueryConfig,
};
