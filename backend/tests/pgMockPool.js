const { pgQueryText, pgQueryValues } = require('./pgQueryArgs');

/**
 * Adds pool.connect() so withPgTransaction works in HTTP integration tests.
 */
function wrapPoolWithTransaction(basePool) {
    const query = basePool.query.bind(basePool);
    return {
        ...basePool,
        query,
        connect: async () => {
            const client = {
                query: async (configOrText, values) => {
                    const text = pgQueryText(configOrText);
                    if (/^BEGIN$/i.test(text.trim())) return { rowCount: 0, rows: [] };
                    if (/^COMMIT$/i.test(text.trim())) return { rowCount: 0, rows: [] };
                    if (/^ROLLBACK$/i.test(text.trim())) return { rowCount: 0, rows: [] };
                    return query(configOrText, values);
                },
                release: () => {},
            };
            return client;
        },
    };
}

function handleCommonDashboardQueries(text, queryValues, ctx) {
    const { sessions, userRow, extraUsers = new Map() } = ctx;

    if (/\bIS NOT 1\b/i.test(text) || /\bIS 1\b/i.test(text)) {
        const err = new Error('42601 syntax error at or near "1"');
        err.code = '42601';
        throw err;
    }

    if (/INSERT INTO auth_sessions/i.test(text)) {
        sessions.set(queryValues[0], { userId: queryValues[1], expiresAt: Number(queryValues[2]) });
        return { rowCount: 1, rows: [] };
    }
    if (/DELETE FROM auth_sessions/i.test(text)) {
        if (queryValues.length === 1) sessions.delete(queryValues[0]);
        return { rowCount: 1, rows: [] };
    }
    if (/FROM users/i.test(text) && /lower\(trim\(email\)\)/i.test(text)) {
        const email = queryValues[0];
        if (email === userRow.email) return { rows: [userRow], rowCount: 1 };
        const extra = extraUsers.get(email);
        return extra ? { rows: [extra], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/FROM users/i.test(text) && /lower\(email\)/i.test(text)) {
        const email = queryValues[0];
        if (email === userRow.email) {
            return {
                rows: [{
                    id: userRow.id,
                    name: userRow.name,
                    email: userRow.email,
                    avatar: userRow.avatar_url || null,
                }],
                rowCount: 1,
            };
        }
        return { rows: [], rowCount: 0 };
    }
    if (/auth_sessions JOIN users/i.test(text)) {
        const session = sessions.get(queryValues[0]);
        if (!session || session.expiresAt <= Number(queryValues[1])) return { rows: [], rowCount: 0 };
        let account = session.userId === userRow.id
            ? userRow
            : [...extraUsers.values()].find((row) => row.id === session.userId);
        if (!account) return { rows: [], rowCount: 0 };
        return {
            rows: [{
                id: account.id,
                name: account.name,
                email: account.email,
                avatar: account.avatar_url || null,
            }],
            rowCount: 1,
        };
    }
    if (/UPDATE users SET name/i.test(text)) {
        userRow.name = queryValues[0];
        return { rowCount: 1, rows: [] };
    }
    if (/INSERT INTO users/i.test(text) && /RETURNING id/i.test(text)) {
        const id = userRow.id + extraUsers.size + 100;
        const hasAvatarColumn = /avatar_url/i.test(text);
        const row = {
            id,
            name: queryValues[0],
            email: queryValues[1],
            password_hash: hasAvatarColumn ? null : queryValues[2],
            avatar_url: hasAvatarColumn ? (queryValues[2] || null) : null,
            email_verified: hasAvatarColumn ? 1 : 1,
        };
        extraUsers.set(String(row.email).toLowerCase(), row);
        if (hasAvatarColumn && /RETURNING id, name, email, avatar_url AS avatar/i.test(text)) {
            return {
                rows: [{
                    id: row.id,
                    name: row.name,
                    email: row.email,
                    avatar: row.avatar_url,
                }],
                rowCount: 1,
            };
        }
        return { rows: [{ id }], rowCount: 1 };
    }
    if (/FROM subscription_details/i.test(text)) {
        return { rows: [], rowCount: 0 };
    }
    if (/SELECT used FROM usage/i.test(text)) {
        const used = ctx.usageCounts?.get(queryValues[0]) ?? 0;
        return { rows: [{ used }], rowCount: 1 };
    }
    if (/SELECT COUNT\(\*\)/i.test(text)) {
        if (/FROM conversations/i.test(text) && ctx.conversations) {
            const email = queryValues[0];
            const c = ctx.conversations.filter((item) => item.email === email).length;
            return { rows: [{ c }], rowCount: 1 };
        }
        return { rows: [{ c: 0 }], rowCount: 1 };
    }
    if (/COUNT\(DISTINCT substr\(created_at/i.test(text)) {
        const c = ctx.usageEvents?.length ? 1 : 0;
        return { rows: [{ c }], rowCount: 1 };
    }
    if (/account_access_modes/i.test(text)) {
        if (!ctx.accessModes) ctx.accessModes = new Map();
        if (/INSERT INTO account_access_modes/i.test(text)) {
            ctx.accessModes.set(String(queryValues[0]).toLowerCase(), queryValues[1]);
            return { rowCount: 1, rows: [] };
        }
        if (/FROM account_access_modes/i.test(text)) {
            const mode = ctx.accessModes.get(String(queryValues[0]).toLowerCase());
            return mode ? { rows: [{ mode }], rowCount: 1 } : { rows: [], rowCount: 0 };
        }
        if (/DELETE FROM account_access_modes/i.test(text)) {
            ctx.accessModes.delete(String(queryValues[0]).toLowerCase());
            return { rowCount: 1, rows: [] };
        }
    }
    if (/FROM conversations/i.test(text)) {
        if (ctx.conversations) {
            return handleConversationSelect(text, queryValues, ctx);
        }
        return { rows: [], rowCount: 0 };
    }
    if (/FROM knowledge_chunks/i.test(text) || /FROM knowledge_documents/i.test(text)) {
        return { rows: [], rowCount: 0 };
    }
    if (/FROM user_ai_settings/i.test(text) || /INSERT INTO user_ai_settings/i.test(text)) {
        if (/INSERT INTO user_ai_settings/i.test(text)) {
            return { rowCount: 1, rows: [] };
        }
        return { rows: [], rowCount: 0 };
    }
    if (/FROM user_ai_memories/i.test(text)) {
        return { rows: [], rowCount: 0 };
    }
    if (/INSERT INTO router_metrics/i.test(text)) {
        return { rowCount: 1, rows: [] };
    }
    if (/FROM workspace_items/i.test(text)) {
        if (/type = 'memory'/i.test(text) && ctx.memoryRows) {
            return { rows: ctx.memoryRows, rowCount: ctx.memoryRows.length };
        }
        if (/type = 'document'/i.test(text) && ctx.documentRows) {
            return { rows: ctx.documentRows, rowCount: ctx.documentRows.length };
        }
        return { rows: [], rowCount: 0 };
    }
    if (/INSERT INTO workspace_items/i.test(text)) {
        return { rowCount: 1, rows: [] };
    }
    if (/UPDATE subscription_details/i.test(text)) {
        return { rowCount: 0, rows: [] };
    }
    if (/INSERT INTO subscriptions/i.test(text)) {
        return { rowCount: 1, rows: [] };
    }
    if (ctx.socialChallenges && /INSERT INTO social_auth_challenges/i.test(text)) {
        ctx.socialChallenges.set(queryValues[0], {
            state_hash: queryValues[0],
            intent: queryValues[1],
            session_hash: queryValues[2],
            user_id: queryValues[3],
            expires_at: Number(queryValues[4]),
        });
        return { rowCount: 1, rows: [] };
    }
    if (ctx.socialChallenges && /FROM social_auth_challenges/i.test(text)) {
        const row = ctx.socialChallenges.get(queryValues[0]);
        if (!row || row.expires_at <= Number(queryValues[1])) {
            return { rows: [], rowCount: 0 };
        }
        return { rows: [row], rowCount: 1 };
    }
    if (ctx.socialChallenges && /DELETE FROM social_auth_challenges/i.test(text)) {
        const had = ctx.socialChallenges.has(queryValues[0]);
        if (had) ctx.socialChallenges.delete(queryValues[0]);
        return { rowCount: had ? 1 : 0, rows: [] };
    }
    if (ctx.socialIdentities && /INSERT INTO social_identities/i.test(text)) {
        ctx.socialIdentities.set(`${queryValues[0]}:${queryValues[1]}`, {
            provider: queryValues[0],
            subject: queryValues[1],
            user_id: queryValues[2],
        });
        return { rowCount: 1, rows: [] };
    }
    if (ctx.socialIdentities && /FROM social_identities/i.test(text)) {
        if (/WHERE provider = \$1 AND subject = \$2/i.test(text)) {
            const row = ctx.socialIdentities.get(`${queryValues[0]}:${queryValues[1]}`);
            return row ? { rows: [{ user_id: row.user_id }], rowCount: 1 } : { rows: [], rowCount: 0 };
        }
        if (/WHERE user_id = \$1 AND provider = \$2/i.test(text)) {
            const row = [...ctx.socialIdentities.values()].find(
                (item) => item.user_id === queryValues[0] && item.provider === queryValues[1],
            );
            return row ? { rows: [{ subject: row.subject }], rowCount: 1 } : { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
    }
    if (/UPDATE users SET email_verified = 1/i.test(text)) {
        const id = queryValues[0];
        const account = id === userRow.id
            ? userRow
            : [...extraUsers.values()].find((row) => row.id === id);
        if (account) account.email_verified = 1;
        return { rowCount: 1, rows: [] };
    }
    if (/FROM users/i.test(text) && /WHERE id = \$1/i.test(text) && /avatar_url AS avatar/i.test(text)) {
        const id = queryValues[0];
        const account = id === userRow.id
            ? userRow
            : [...extraUsers.values()].find((row) => row.id === id);
        if (!account) return { rows: [], rowCount: 0 };
        return {
            rows: [{
                id: account.id,
                name: account.name,
                email: account.email,
                avatar: account.avatar_url || null,
            }],
            rowCount: 1,
        };
    }
    if (/FROM users/i.test(text) && /WHERE id = \$1/i.test(text) && /password_hash AS "passwordHash"/i.test(text)) {
        const id = queryValues[0];
        const account = id === userRow.id
            ? userRow
            : [...extraUsers.values()].find((row) => row.id === id);
        if (!account) return { rows: [], rowCount: 0 };
        return {
            rows: [{
                id: account.id,
                name: account.name,
                email: account.email,
                passwordHash: account.password_hash ?? null,
            }],
            rowCount: 1,
        };
    }
    if (/UPDATE users SET avatar_url = COALESCE\(avatar_url, \$1\) WHERE id = \$2/i.test(text)) {
        const account = queryValues[1] === userRow.id
            ? userRow
            : [...extraUsers.values()].find((row) => row.id === queryValues[1]);
        if (account && !account.avatar_url) account.avatar_url = queryValues[0];
        return { rowCount: 1, rows: [] };
    }
    if (/FROM social_identities/i.test(text)) {
        return { rows: [], rowCount: 0 };
    }
    if (/SELECT password_hash FROM users/i.test(text)) {
        return { rows: [{ password_hash: userRow.password_hash }], rowCount: 1 };
    }
    if (/INSERT INTO usage_events/i.test(text) && ctx.usageEvents) {
        ctx.usageEvents.push({
            email: queryValues[0],
            model: queryValues[1],
            inputTokens: queryValues[2],
            outputTokens: queryValues[3],
            latencyMs: queryValues[4],
            fallbackUsed: queryValues[5],
            estimatedCost: queryValues[6],
            createdAt: queryValues[7],
        });
        return { rowCount: 1, rows: [] };
    }
    if (/INSERT INTO usage \(email, used\)/i.test(text) && ctx.usageCounts) {
        const key = queryValues[0];
        ctx.usageCounts.set(key, (ctx.usageCounts.get(key) || 0) + 1);
        return { rowCount: 1, rows: [] };
    }
    if (/INSERT INTO conversations/i.test(text) && ctx.conversations) {
        ctx.conversations.push({
            id: queryValues[0],
            email: queryValues[1],
            model: queryValues[2],
            title: queryValues[3],
            messages: queryValues[4],
            created_at: queryValues[5],
            updated_at: queryValues[6],
        });
        return { rowCount: 1, rows: [] };
    }
    if (/UPDATE conversations SET/i.test(text) && ctx.conversations) {
        const id = queryValues[queryValues.length - 2];
        const convEmail = queryValues[queryValues.length - 1];
        const conv = ctx.conversations.find((item) => item.id === id && item.email === convEmail);
        if (conv) {
            let valueIndex = 0;
            if (/title =/i.test(text)) {
                conv.title = queryValues[valueIndex];
                valueIndex += 1;
            }
            if (/messages =/i.test(text)) {
                conv.messages = queryValues[valueIndex];
                valueIndex += 1;
            }
            if (/updated_at =/i.test(text)) {
                conv.updated_at = queryValues[valueIndex];
            }
            return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
    }
    if (/INSERT INTO|UPDATE|DELETE FROM/i.test(text)) {
        return { rowCount: 1, rows: [] };
    }
    if (/SELECT 1/i.test(text)) {
        return { rows: [{ ok: 1 }], rowCount: 1 };
    }
    if (/background_jobs|webhooks|audit_events|storage_|notifications|developer_api_keys|teams|arena_votes/i.test(text)) {
        return { rows: [], rowCount: 0 };
    }
    if (/FROM usage_events/i.test(text) && /SELECT/i.test(text)) {
        if (ctx.usageEvents?.length) {
            const rows = ctx.usageEvents.map((event) => ({
                model: event.model,
                inputTokens: event.inputTokens,
                outputTokens: event.outputTokens,
                latencyMs: event.latencyMs,
                fallbackUsed: event.fallbackUsed,
                estimatedCost: event.estimatedCost,
                createdAt: event.createdAt,
            }));
            return { rows, rowCount: rows.length };
        }
        return { rows: [], rowCount: 0 };
    }

    return null;
}

function handleConversationSelect(text, queryValues, ctx) {
    const normalized = ctx.userRow.email.toLowerCase();
    const mapRow = (row) => ({
        id: row.id,
        email: row.email,
        model: row.model,
        title: row.title,
        messages: row.messages,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    });

    if (/lower\(trim\(email\)\)/i.test(text)) {
        const rows = ctx.conversations
            .filter((item) => String(item.email).trim().toLowerCase() === queryValues[0])
            .map(mapRow);
        return { rows, rowCount: rows.length };
    }
    if (/WHERE email = \$1/i.test(text) && !/id = \$1/i.test(text)) {
        const rows = ctx.conversations
            .filter((item) => item.email === queryValues[0])
            .map((row) => ({
                model: row.model,
                messages: row.messages,
                createdAt: row.created_at,
            }));
        return { rows, rowCount: rows.length };
    }
    if (/WHERE id = \$1 AND email = \$2/i.test(text)) {
        const row = ctx.conversations.find((item) => item.id === queryValues[0] && item.email === queryValues[1]);
        return row
            ? { rows: [mapRow(row)], rowCount: 1 }
            : { rows: [], rowCount: 0 };
    }
    if (/FROM conversations/i.test(text)) {
        const rows = ctx.conversations.filter((item) => item.email === normalized).map(mapRow);
        return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
}

function createPostgresHttpMockPool(initialUser, { trackChat = false, trackSocial = false } = {}) {
    const sessions = new Map();
    const userRow = { ...initialUser, email_verified: initialUser.email_verified ?? 0 };
    const extraUsers = new Map();
    const ctx = {
        sessions,
        userRow,
        extraUsers,
        ...(trackSocial ? { socialChallenges: new Map(), socialIdentities: new Map() } : {}),
        ...(trackChat
            ? {
                conversations: [],
                usageEvents: [],
                usageCounts: new Map(),
                accessModes: new Map(),
                memoryRows: [{ data: JSON.stringify({ name: 'Pinned fact' }) }],
                documentRows: [],
            }
            : {}),
    };

    const basePool = {
        sessions,
        userRow,
        extraUsers,
        ...(trackChat
            ? {
                conversations: ctx.conversations,
                usageEvents: ctx.usageEvents,
                usageCounts: ctx.usageCounts,
            }
            : {}),
        query: async (configOrText, values) => {
            const text = pgQueryText(configOrText);
            const queryValues = pgQueryValues(configOrText, values);
            await Promise.resolve();
            const handled = handleCommonDashboardQueries(text, queryValues, ctx);
            if (handled) return handled;
            throw new Error(`Unexpected postgres query in dashboard HTTP test: ${text.slice(0, 120)}`);
        },
    };

    return wrapPoolWithTransaction(basePool);
}

function attachPostgresAppDb(app, mockPool, { trapSyncPrepare = false } = {}) {
    let prepareCalls = 0;
    let readCalls = 0;
    let writeCalls = 0;
    const forbid = () => {
        const error = new Error('SYNC_POSTGRES_FORBIDDEN_IN_HTTP');
        error.code = 'SYNC_POSTGRES_FORBIDDEN_IN_HTTP';
        throw error;
    };
    const syncTrap = {
        prepare() {
            prepareCalls += 1;
            if (trapSyncPrepare) forbid();
            return {
                get: () => null,
                all: () => [],
                run: () => ({ changes: 0 }),
            };
        },
        read() {
            readCalls += 1;
            if (trapSyncPrepare) forbid();
            return { users: [], conversations: [], purchases: [], subscriptions: {}, usage: {} };
        },
        write() {
            writeCalls += 1;
            if (trapSyncPrepare) forbid();
        },
    };
    const originalDb = app.locals.db;
    app.locals.db = {
        engine: 'postgres',
        pgAsyncPool: mockPool,
        database: trapSyncPrepare ? syncTrap : { pool: mockPool },
    };
    return {
        restore() {
            app.locals.db = originalDb;
        },
        getPrepareCalls: () => prepareCalls,
        getReadCalls: () => readCalls,
        getWriteCalls: () => writeCalls,
        getSyncViolationCount: () => prepareCalls + readCalls + writeCalls,
    };
}

function mockGeminiChatFetch(answerText = 'Mock PG chat answer') {
    const encoder = new TextEncoder();
    return async () => new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: answerText }] } }] })}\n\n`,
            ));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
        },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

async function waitForChatPersistence(mockPool, { timeoutMs = 5000 } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (mockPool.usageEvents?.length >= 1 && mockPool.conversations?.length >= 1) {
            return;
        }
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('Chat async persistence did not complete in time');
}

module.exports = {
    wrapPoolWithTransaction,
    createPostgresHttpMockPool,
    handleCommonDashboardQueries,
    attachPostgresAppDb,
    mockGeminiChatFetch,
    waitForChatPersistence,
};
