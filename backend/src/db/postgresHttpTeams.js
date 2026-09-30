const { queryPgPool, resolvePostgresAsyncPool, withPgTransaction, queryPgClient } = require('./pgPoolQuery');

async function listTeamsForUserAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT teams.*, team_members.role
         FROM teams
         JOIN team_members ON team_members.team_id = teams.id
         WHERE team_members.email = $1
         ORDER BY teams.created_at DESC`,
        [email],
    );
    return result.rows;
}

async function listTeamMembersAsync(connection, teamId) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT email, role, created_at AS "createdAt"
         FROM team_members WHERE team_id = $1 ORDER BY created_at`,
        [teamId],
    );
    return result.rows;
}

async function getTeamAccessAsync(connection, teamId, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT teams.*, team_members.role
         FROM teams
         JOIN team_members ON team_members.team_id = teams.id
         WHERE teams.id = $1 AND team_members.email = $2`,
        [teamId, email],
    );
    return result.rows[0] || null;
}

async function createTeamAsync(connection, { id, name, ownerEmail, now }) {
    const pool = resolvePostgresAsyncPool(connection);
    await withPgTransaction(pool, async (client) => {
        await queryPgClient(
            client,
            'INSERT INTO teams (id, name, owner_email, created_at) VALUES ($1, $2, $3, $4)',
            [id, name, ownerEmail, now],
        );
        await queryPgClient(
            client,
            'INSERT INTO team_members (team_id, email, role, created_at) VALUES ($1, $2, $3, $4)',
            [id, ownerEmail, 'owner', now],
        );
    });
}

async function upsertTeamMemberAsync(connection, teamId, email, role, createdAt) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `INSERT INTO team_members (team_id, email, role, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (team_id, email) DO UPDATE SET role = EXCLUDED.role`,
        [teamId, email, role, createdAt],
    );
}

async function updateTeamMemberRoleAsync(connection, teamId, email, role) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'UPDATE team_members SET role = $1 WHERE team_id = $2 AND email = $3',
        [role, teamId, email],
    );
    return result.rowCount ?? 0;
}

async function removeTeamMemberAsync(connection, teamId, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'DELETE FROM team_members WHERE team_id = $1 AND email = $2',
        [teamId, email],
    );
    return result.rowCount ?? 0;
}

module.exports = {
    listTeamsForUserAsync,
    listTeamMembersAsync,
    getTeamAccessAsync,
    createTeamAsync,
    upsertTeamMemberAsync,
    updateTeamMemberRoleAsync,
    removeTeamMemberAsync,
};
