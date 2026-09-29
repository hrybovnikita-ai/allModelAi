const path = require('node:path');

try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

const command = process.argv[2];
if (!['init', 'check'].includes(command)) {
    throw new Error('Usage: node scripts/database.js init|check');
}

const { resolveDatabaseUrl } = require('../src/db/provider');
const {
    createPgPool,
    describePgFailure,
    verifyPostgresConnection,
} = require('../src/db/pgConfig');

async function checkPostgres(resolved) {
    console.log('Database engine: postgres');
    console.log(`DATABASE_URL configured: yes (${resolved.source})`);

    const pool = createPgPool(resolved.url);
    try {
        const status = await verifyPostgresConnection(pool);
        const { sslMode } = require('../src/db/pgConfig').getPgPoolConfig(resolved.url);
        console.log('PostgreSQL connection: successful');
        console.log(`TLS mode: ${sslMode}`);
        console.log(`users table present: ${status.usersTablePresent ? 'yes' : 'no'}`);
        if (!status.usersTablePresent) {
            console.log('Next step: run npm run db:migrate');
            process.exitCode = 1;
            return;
        }
        console.log(JSON.stringify({ status: 'ok', engine: 'postgres', configuredFrom: resolved.source }, null, 2));
    } catch (error) {
        const failure = describePgFailure(error);
        console.log('PostgreSQL connection: failed');
        console.log(`Reason: ${failure.reason}`);
        console.log(failure.hint);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

function checkSqlite() {
    const { connectDatabase } = require('../src/db');
    const connection = connectDatabase();
    try {
        const db = connection.database;
        if (command === 'check') {
            const result = db.pragma('integrity_check');
            if (result.some((row) => row.integrity_check !== 'ok') || db.pragma('foreign_key_check').length) {
                throw new Error('Database integrity check failed');
            }
        }
        console.log('Database engine: sqlite');
        console.log('DATABASE_URL configured: no');
        console.log('PostgreSQL connection: not configured');
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
        console.log(JSON.stringify({
            engine: 'sqlite',
            file: connection.filePath,
            status: 'ok',
            tables: tables.map((row) => row.name),
        }, null, 2));
    } finally {
        connection.close();
    }
}

async function main() {
    const resolved = resolveDatabaseUrl();
    if (resolved) {
        await checkPostgres(resolved);
        return;
    }
    checkSqlite();
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
