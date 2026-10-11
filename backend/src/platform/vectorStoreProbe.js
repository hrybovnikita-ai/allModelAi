const { isPostgresConnection } = require('../db/postgresHttpReads');
const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');

async function probePgVector(connection) {
    if (!isPostgresConnection(connection)) {
        return {
            engine: 'sqlite',
            pgvectorAvailable: false,
            strategy: 'embedding_json_cosine',
            note: 'SQLite uses in-app cosine similarity on stored embedding JSON.',
        };
    }
    try {
        const pool = resolvePostgresAsyncPool(connection);
        const ext = await queryPgPool(
            pool,
            `SELECT EXISTS(
                SELECT 1 FROM pg_extension WHERE extname = 'vector'
            ) AS installed`,
        );
        const installed = ext.rows[0]?.installed === true;
        if (installed) {
            return {
                engine: 'postgres',
                pgvectorAvailable: true,
                strategy: 'pgvector',
                note: 'pgvector extension is installed. Future migrations may use vector columns.',
            };
        }
        return {
            engine: 'postgres',
            pgvectorAvailable: false,
            strategy: 'embedding_json_cosine',
            note: 'PostgreSQL without pgvector; using JSON embeddings and application-side similarity.',
        };
    } catch (error) {
        return {
            engine: 'postgres',
            pgvectorAvailable: false,
            strategy: 'embedding_json_cosine',
            error: error.message,
        };
    }
}

module.exports = {
    probePgVector,
};
