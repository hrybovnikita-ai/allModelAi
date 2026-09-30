const deasync = require('deasync');
const { forbidSyncPostgresInHttp } = require('./httpPostgresGuard');
const { createPgPool, formatSafePgFailure } = require('./pgConfig');
const {
    translatePlaceholders,
    translateSql,
    insertReturningSuffix,
} = require('./sqlTranslate');

function waitFor(promiseFactory) {
    let finished = false;
    let error = null;
    let result = null;
    promiseFactory()
        .then((value) => {
            result = value;
            finished = true;
        })
        .catch((err) => {
            error = err;
            finished = true;
        });
    deasync.loopWhile(() => !finished);
    if (error) {
        throw error;
    }
    return result;
}

class PostgresSyncDatabase {
    constructor(pool) {
        this.pool = pool;
        this._pragmaTableInfoCache = new Map();
        this._txClient = null;
    }

    _query(text, values = []) {
        const client = this._txClient;
        if (client) {
            return waitFor(() => client.query(text, values));
        }
        return waitFor(() => this.pool.query(text, values));
    }

    prepare(sql) {
        forbidSyncPostgresInHttp();
        const baseSql = translateSql(sql);
        const self = this;

        return {
            get(...params) {
                const { text, values } = translatePlaceholders(baseSql, params);
                const result = self._query(text, values);
                return result.rows[0];
            },
            all(...params) {
                const { text, values } = translatePlaceholders(baseSql, params);
                const result = self._query(text, values);
                return result.rows;
            },
            run(...params) {
                let sqlText = baseSql;
                const returning = insertReturningSuffix(sqlText);
                if (returning) {
                    sqlText = `${sqlText.trim()}${returning}`;
                }
                const { text, values } = translatePlaceholders(sqlText, params);
                const result = self._query(text, values);
                const row = result.rows[0];
                return {
                    changes: result.rowCount ?? 0,
                    lastInsertRowid: row?.id ?? null,
                };
            },
        };
    }

    exec(sql) {
        forbidSyncPostgresInHttp();
        const statements = String(sql)
            .split(';')
            .map((part) => part.trim())
            .filter(Boolean);
        for (const statement of statements) {
            this._query(translateSql(statement));
        }
    }

    transaction(fn) {
        forbidSyncPostgresInHttp();
        const self = this;
        return () => {
            waitFor(async () => {
                const client = await self.pool.connect();
                try {
                    await client.query('BEGIN');
                    self._txClient = client;
                    try {
                        fn();
                    } finally {
                        self._txClient = null;
                    }
                    await client.query('COMMIT');
                } catch (error) {
                    await client.query('ROLLBACK');
                    throw error;
                } finally {
                    client.release();
                }
            });
        };
    }

    pragma(command, options = {}) {
        const normalized = String(command).trim().toLowerCase();
        if (normalized === 'foreign_keys = on') {
            return undefined;
        }
        if (normalized === 'journal_mode = wal') {
            return 'wal';
        }
        if (normalized === 'busy_timeout = 5000') {
            return 5000;
        }
        if (normalized === 'optimize') {
            return undefined;
        }
        if (normalized.startsWith('integrity_check')) {
            this.prepare('SELECT 1 AS ok').get();
            return options.simple ? 'ok' : [{ ok: 1 }];
        }
        const tableInfoMatch = normalized.match(/^table_info\(([^)]+)\)$/);
        if (tableInfoMatch) {
            const table = tableInfoMatch[1].replace(/['"]/g, '');
            if (!this._pragmaTableInfoCache.has(table)) {
                const rows = this.prepare(`
                    SELECT column_name AS name
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = ?
                    ORDER BY ordinal_position
                `).all(table);
                this._pragmaTableInfoCache.set(table, rows);
            }
            return this._pragmaTableInfoCache.get(table);
        }
        return undefined;
    }

    close() {
        waitFor(() => this.pool.end());
    }
}

function connectPostgresSync(connectionString) {
    const pool = createPgPool(connectionString);
    try {
        waitFor(() => pool.query('SELECT 1'));
    } catch (error) {
        waitFor(() => pool.end());
        throw new Error(formatSafePgFailure(error));
    }
    const database = new PostgresSyncDatabase(pool);
    const usersTable = database.prepare(`
        SELECT 1 AS ok
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
    `).get();
    if (!usersTable) {
        database.close();
        throw new Error(
            'PostgreSQL connected but schema is missing the users table. Run npm run db:migrate first.',
        );
    }
    return database;
}

module.exports = {
    connectPostgresSync,
    PostgresSyncDatabase,
};
