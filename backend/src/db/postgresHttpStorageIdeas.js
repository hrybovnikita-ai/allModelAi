const { queryPgPool, resolvePostgresAsyncPool } = require('./pgPoolQuery');

async function countForEmail(connection, table, email, extraWhere = '') {
    const pool = resolvePostgresAsyncPool(connection);
    const where = extraWhere ? ` AND ${extraWhere}` : '';
    const result = await queryPgPool(pool, `SELECT COUNT(*)::int AS c FROM ${table} WHERE email = $1${where}`, [email]);
    return Number(result.rows[0]?.c ?? 0);
}

async function getStorageOverviewCountsAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const usageDays = await queryPgPool(
        pool,
        `SELECT COUNT(DISTINCT substr(created_at, 1, 10))::int AS c FROM usage_events WHERE email = $1`,
        [email],
    );
    const chatSettings = await countForEmail(connection, 'storage_chat_settings', email);
    return {
        chatHistory: await countForEmail(connection, 'conversations', email),
        favoritePrompts: await countForEmail(connection, 'storage_favorite_prompts', email),
        chatSettings,
        builderProjects: await countForEmail(connection, 'storage_builder_projects', email),
        usageDays: Number(usageDays.rows[0]?.c ?? 0),
        modelBookmarks: await countForEmail(connection, 'storage_model_bookmarks', email),
        attachments: await countForEmail(connection, 'storage_message_attachments', email),
        trainingRuns: await countForEmail(connection, 'storage_training_runs', email),
    };
}

async function pgQuery(connection, text, values = []) {
    return queryPgPool(resolvePostgresAsyncPool(connection), text, values);
}

module.exports = {
    getStorageOverviewCountsAsync,
    pgQuery,
};
