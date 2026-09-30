const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { ensureStorageIdeasSchema } = require('./storageIdeasSchema');
const { createConnectionApi } = require('./db/connectionApi');
const { connectPostgresSync } = require('./db/postgresSync');
const { createAuthPgPool, formatSafePgFailure } = require('./db/pgConfig');
const {
    getDatabaseEngine,
    resolveDatabaseUrl,
    assertProductionDatabasePolicy,
} = require('./db/provider');

const defaultDatabase = {
    users: [],
    purchases: [],
    subscriptions: {},
    usage: {},
    conversations: [],
};

let connection;

const readLegacyData = (filePath) => {
    if (!fs.existsSync(filePath)) {
        return defaultDatabase;
    }

    try {
        return {
            ...defaultDatabase,
            ...JSON.parse(fs.readFileSync(filePath, 'utf8')),
        };
    } catch {
        return defaultDatabase;
    }
};

const connectDatabase = () => {
    if (process.env.VERCEL) {
        throw new Error('Vercel cannot persist SQLite sessions. Configure PERSISTENT_BACKEND_ORIGIN.');
    }
    if (connection) {
        return connection;
    }

    assertProductionDatabasePolicy();

    const resolvedPostgres = resolveDatabaseUrl();
    if (resolvedPostgres) {
        if (process.env.NODE_ENV === 'test' && process.env.ALLOW_POSTGRES_TESTS !== 'true') {
            throw new Error(
                'Refusing to run tests against PostgreSQL. Unset DATABASE_URL or set ALLOW_POSTGRES_TESTS=true.',
            );
        }
        let database;
        try {
            database = connectPostgresSync(resolvedPostgres.url);
        } catch (error) {
            throw new Error(
                `PostgreSQL connection failed (${resolvedPostgres.source} is set). ${formatSafePgFailure(error)}`,
            );
        }
        connection = createConnectionApi(database, {
            engine: 'postgres',
            filePath: 'postgresql',
            configuredFrom: resolvedPostgres.source,
        });
        connection.pgAsyncPool = createAuthPgPool(resolvedPostgres.url);
        const originalClose = connection.close.bind(connection);
        connection.close = () => {
            const authPool = connection.pgAsyncPool;
            connection.pgAsyncPool = undefined;
            if (authPool) {
                void authPool.end().catch(() => {});
            }
            originalClose();
            connection = undefined;
        };
        return connection;
    }

    // Local development:
    // backend/storage/database.sqlite
    //
    const configuredPath = process.env.DB_FILE
        ? path.resolve(__dirname, '..', process.env.DB_FILE)
        : path.join(
                __dirname,
                '..',
                'storage',
                'database.sqlite'
            );

    const isLegacyJson =
        path.extname(configuredPath).toLowerCase() === '.json';

    const filePath = isLegacyJson
        ? `${configuredPath}.sqlite`
        : configuredPath;

    const defaultDevDatabasePath = path.resolve(
        __dirname,
        '..',
        'storage',
        'database.sqlite',
    );
    const resolvedDatabasePath = path.resolve(filePath);
    if (process.env.NODE_ENV === 'test') {
        const allowRealDatabase = process.env.ALLOW_REAL_DATABASE === 'true';
        if (!allowRealDatabase && resolvedDatabasePath === defaultDevDatabasePath) {
            throw new Error(
                'Refusing to run tests against backend/storage/database.sqlite. '
                + 'Use tests/test-preload.js or set DB_FILE to an isolated test database.',
            );
        }
    }

    // Locally this creates backend/storage if necessary.
    const databaseDirectory = path.dirname(filePath);

    if (!fs.existsSync(databaseDirectory)) {
        fs.mkdirSync(databaseDirectory, {
            recursive: true,
        });
    }

    const defaultLegacyPath = path.join(
        __dirname,
        '..',
        'storage',
        'database.json'
    );

    const legacyPath = isLegacyJson
        ? configuredPath
        : process.env.DB_FILE
            ? null
            : defaultLegacyPath;

    const legacyData = legacyPath
        ? readLegacyData(legacyPath)
        : defaultDatabase;

    const database = new Database(filePath);

    database.pragma('foreign_keys = ON');
    database.pragma('journal_mode = WAL');
    database.pragma('busy_timeout = 5000');

    database.exec(
        fs.readFileSync(
            path.join(
                __dirname,
                '..',
                'sql',
                'schema.sql'
            ),
            'utf8'
        )
    );

    // Additive Firebase authentication table; existing accounts,
    // sessions and conversations are not touched.
    database.exec(
        `
        CREATE TABLE IF NOT EXISTS auth_identities (
            provider TEXT NOT NULL,
            provider_uid TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (provider, provider_uid),
            FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS auth_identities_user_id
        ON auth_identities(user_id);
        `
    );

    const apiKeyColumns = database
        .prepare(
            'PRAGMA table_info(developer_api_keys)'
        )
        .all();

    if (
        !apiKeyColumns.some(
            (column) =>
                column.name === 'expires_at'
        )
    ) {
        database.exec(
            'ALTER TABLE developer_api_keys ADD COLUMN expires_at TEXT'
        );
    }

    if (
        !apiKeyColumns.some(
            (column) =>
                column.name === 'request_limit'
        )
    ) {
        database.exec(
            'ALTER TABLE developer_api_keys ADD COLUMN request_limit INTEGER NOT NULL DEFAULT 1000'
        );
    }

    if (
        !apiKeyColumns.some(
            (column) =>
                column.name === 'used_count'
        )
    ) {
        database.exec(
            'ALTER TABLE developer_api_keys ADD COLUMN used_count INTEGER NOT NULL DEFAULT 0'
        );
    }

    const productionUserColumns = database
        .prepare(
            'PRAGMA table_info(users)'
        )
        .all();

    if (
        !productionUserColumns.some(
            (column) =>
                column.name === 'email_verified'
        )
    ) {
        database.exec(
            'ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0'
        );
    }

    if (
        !productionUserColumns.some(
            (column) =>
                column.name === 'role'
        )
    ) {
        database.exec(
            "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'"
        );
    }

    if (!productionUserColumns.some(column => column.name === 'avatar_url')) {
        database.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
    }

    const userColumns = database
        .prepare(
            'PRAGMA table_info(users)'
        )
        .all();

    if (
        !userColumns.some(
            (column) =>
                column.name === 'password_hash'
        )
    ) {
        database.exec(
            'ALTER TABLE users ADD COLUMN password_hash TEXT'
        );
    }

    ensureStorageIdeasSchema(database);

    database.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
        ON users(email);

        PRAGMA optimize;
    `);

    const usersCount = database
        .prepare(
            'SELECT COUNT(*) AS count FROM users'
        )
        .get()
        .count;

    if (
        usersCount === 0 &&
        legacyData.users.length
    ) {
        const insertUser = database.prepare(`
            INSERT OR IGNORE INTO users (
                id,
                name,
                email,
                password_hash
            )
            VALUES (?, ?, ?, ?)
        `);

        const insertPurchase = database.prepare(`
            INSERT OR IGNORE INTO purchases (
                id,
                name,
                email,
                city,
                date_of_birth,
                plan,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const insertSubscription = database.prepare(`
            INSERT OR REPLACE INTO subscriptions (
                email,
                plan
            )
            VALUES (?, ?)
        `);

        const insertUsage = database.prepare(`
            INSERT OR REPLACE INTO usage (
                email,
                used
            )
            VALUES (?, ?)
        `);

        const insertConversation = database.prepare(`
            INSERT OR REPLACE INTO conversations (
                id,
                email,
                model,
                title,
                messages,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        database.transaction(() => {
            legacyData.users.forEach(
                (user) => {
                    insertUser.run(
                        user.id,
                        user.name,
                        user.email,
                        user.passwordHash || null
                    );
                }
            );

            legacyData.purchases.forEach(
                (purchase) => {
                    insertPurchase.run(
                        purchase.id,
                        purchase.name,
                        purchase.email,
                        purchase.city,
                        purchase.dateOfBirth,
                        purchase.plan,
                        purchase.createdAt
                    );
                }
            );

            Object.entries(
                legacyData.subscriptions || {}
            ).forEach(
                ([email, plan]) => {
                    insertSubscription.run(
                        email,
                        plan
                    );
                }
            );

            Object.entries(
                legacyData.usage || {}
            ).forEach(
                ([email, used]) => {
                    insertUsage.run(
                        email,
                        used
                    );
                }
            );

            legacyData.conversations.forEach(
                (conversation) => {
                    insertConversation.run(
                        conversation.id,
                        conversation.email,
                        conversation.model,
                        conversation.title,
                        JSON.stringify(
                            conversation.messages || []
                        ),
                        conversation.createdAt,
                        conversation.updatedAt
                    );
                }
            );
        })();
    }

    if (legacyData.users.length) {
        const findUserByEmail =
            database.prepare(`
                SELECT id
                FROM users
                WHERE lower(email) = lower(?)
            `);

        const findUserById =
            database.prepare(`
                SELECT id
                FROM users
                WHERE id = ?
            `);

        const insertMissingUser =
            database.prepare(`
                INSERT INTO users (
                    id,
                    name,
                    email,
                    password_hash
                )
                VALUES (?, ?, ?, ?)
            `);

        database.transaction(() => {
            legacyData.users.forEach(
                (user) => {
                    if (
                        findUserByEmail.get(
                            user.email
                        )
                    ) {
                        return;
                    }

                    const availableId =
                        findUserById.get(
                            user.id
                        )
                            ? null
                            : user.id;

                    insertMissingUser.run(
                        availableId,
                        user.name,
                        user.email,
                        user.passwordHash || null
                    );
                }
            );
        })();
    }

    connection = createConnectionApi(database, {
        engine: getDatabaseEngine(),
        filePath,
    });
    const originalClose = connection.close.bind(connection);
    connection.close = () => {
        originalClose();
        connection = undefined;
    };

    return connection;
};

module.exports = {
    connectDatabase,
    getDatabaseEngine,
};
