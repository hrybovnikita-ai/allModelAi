const { queryPgPool, resolvePostgresAsyncPool } = require('./pgPoolQuery');

async function insertWorkspaceItemAsync(connection, row) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `INSERT INTO workspace_items (id, email, type, data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.id, row.email, row.type, JSON.stringify(row.data), row.createdAt, row.updatedAt],
    );
}

async function getWorkspaceItemAsync(connection, id, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT id, email, type, data, created_at, updated_at FROM workspace_items WHERE id = $1 AND email = $2',
        [id, email],
    );
    return result.rows[0] || null;
}

async function getWorkspaceItemByIdAsync(connection, id) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT id, email, type, data, created_at, updated_at FROM workspace_items WHERE id = $1',
        [id],
    );
    return result.rows[0] || null;
}

async function updateWorkspaceItemDataAsync(connection, id, dataJson, updatedAt) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'UPDATE workspace_items SET data = $1, updated_at = $2 WHERE id = $3',
        [dataJson, updatedAt, id],
    );
    return result.rowCount ?? 0;
}

async function deleteWorkspaceItemAsync(connection, id, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'DELETE FROM workspace_items WHERE id = $1 AND email = $2',
        [id, email],
    );
    return result.rowCount ?? 0;
}

async function listSharedPromptWorkspaceItemsAsync(connection) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT id, email, type, data, created_at, updated_at
         FROM workspace_items
         WHERE type = 'prompt' AND (data::jsonb->>'shared') = 'true'
         ORDER BY updated_at DESC`,
        [],
    );
    return result.rows;
}

module.exports = {
    insertWorkspaceItemAsync,
    getWorkspaceItemAsync,
    getWorkspaceItemByIdAsync,
    updateWorkspaceItemDataAsync,
    deleteWorkspaceItemAsync,
    listSharedPromptWorkspaceItemsAsync,
};
