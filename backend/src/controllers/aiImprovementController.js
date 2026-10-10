const { isPostgresConnection } = require('../db/postgresHttpReads');
const userMemoryService = require('../services/userMemoryService');
const { recordFeedback, summarizeFeedback } = require('../services/responseFeedbackService');
const { loadProviderPerformance, POLICY_VERSION } = require('../services/smartRouter2/routerPolicy');
const knowledgeBaseService = require('../services/rag/knowledgeBaseService');

async function getMemorySettings(req, res) {
    const settings = await userMemoryService.getSettings(req.app.locals.db, req.user.email);
    return res.json(settings);
}

async function patchMemorySettings(req, res) {
    const body = req.body || {};
    const settings = await userMemoryService.updateSettings(req.app.locals.db, req.user.email, {
        memoryEnabled: body.memoryEnabled,
        shareFeedback: body.shareFeedback,
        excludeTemporaryFromMemory: body.excludeTemporaryFromMemory,
    });
    return res.json(settings);
}

async function listUserMemories(req, res) {
    const items = await userMemoryService.listMemories(req.app.locals.db, req.user.email);
    return res.json({ items });
}

async function createUserMemory(req, res) {
    try {
        const item = await userMemoryService.createMemory(req.app.locals.db, req.user.email, {
            content: req.body?.content,
            sourceType: req.body?.sourceType,
            sourceConversationId: req.body?.conversationId,
        });
        return res.status(201).json(item);
    } catch (error) {
        return res.status(error.status || 500).json({
            message: error.message,
            code: error.code,
        });
    }
}

async function updateUserMemory(req, res) {
    try {
        const item = await userMemoryService.updateMemory(
            req.app.locals.db,
            req.user.email,
            req.params.id,
            req.body?.content,
        );
        return res.json(item);
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message });
    }
}

async function deleteUserMemory(req, res) {
    try {
        const result = await userMemoryService.deleteMemory(req.app.locals.db, req.user.email, req.params.id);
        return res.json(result);
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message });
    }
}

async function clearUserMemories(req, res) {
    const result = await userMemoryService.clearAllMemories(req.app.locals.db, req.user.email);
    return res.json(result);
}

async function postResponseFeedback(req, res) {
    try {
        const result = await recordFeedback(req.app.locals.db, req.user.email, req.body || {});
        return res.status(201).json(result);
    } catch (error) {
        return res.status(error.status || 500).json({
            message: error.message,
            code: error.code,
        });
    }
}

async function getAdminAiImprovementDashboard(req, res) {
    if (!process.env.ADMIN_KEY) return res.status(503).json({ message: 'Admin access is not configured' });
    if (req.get('x-admin-key') !== process.env.ADMIN_KEY) {
        return res.status(401).json({ message: 'Invalid admin key' });
    }
    const connection = req.app.locals.db;
    const feedback = await summarizeFeedback(connection, { days: 30 });
    const routerPerformance = await loadProviderPerformance(connection, { days: 14 });
    let memoryStats = { usersWithMemoryEnabled: 0, memoryItems: 0 };
    let knowledgeStats = { documents: 0, readyDocuments: 0, chunks: 0 };
    try {
        if (isPostgresConnection(connection)) {
            const mem = await connection.pool.query(
                `SELECT
                   (SELECT COUNT(*)::int FROM user_ai_settings WHERE memory_enabled = TRUE) AS enabled_users,
                   (SELECT COUNT(*)::int FROM user_ai_memories) AS memory_items`,
            );
            memoryStats = {
                usersWithMemoryEnabled: mem.rows[0]?.enabled_users || 0,
                memoryItems: mem.rows[0]?.memory_items || 0,
            };
            const kb = await connection.pool.query(
                `SELECT
                   (SELECT COUNT(*)::int FROM knowledge_documents) AS documents,
                   (SELECT COUNT(*)::int FROM knowledge_documents WHERE status = 'ready') AS ready_documents,
                   (SELECT COUNT(*)::int FROM knowledge_chunks) AS chunks`,
            );
            knowledgeStats = {
                documents: kb.rows[0]?.documents || 0,
                readyDocuments: kb.rows[0]?.ready_documents || 0,
                chunks: kb.rows[0]?.chunks || 0,
            };
        } else {
            memoryStats = {
                usersWithMemoryEnabled: connection.database.prepare(
                    'SELECT COUNT(*) AS count FROM user_ai_settings WHERE memory_enabled = 1',
                ).get()?.count || 0,
                memoryItems: connection.database.prepare('SELECT COUNT(*) AS count FROM user_ai_memories').get()?.count || 0,
            };
            knowledgeStats = {
                documents: connection.database.prepare('SELECT COUNT(*) AS count FROM knowledge_documents').get()?.count || 0,
                readyDocuments: connection.database.prepare(
                    "SELECT COUNT(*) AS count FROM knowledge_documents WHERE status = 'ready'",
                ).get()?.count || 0,
                chunks: connection.database.prepare('SELECT COUNT(*) AS count FROM knowledge_chunks').get()?.count || 0,
            };
        }
    } catch (error) {
        console.warn('[AI_IMPROVEMENT_DASHBOARD]', error.message);
    }

    return res.json({
        updatedAt: new Date().toISOString(),
        routerPolicy: POLICY_VERSION,
        feedback,
        routerPerformance,
        memory: memoryStats,
        knowledge: knowledgeStats,
        notes: [
            'Metrics are aggregated from stored feedback and router telemetry only.',
            'No LLM weights are updated by this dashboard.',
        ],
    });
}

module.exports = {
    getMemorySettings,
    patchMemorySettings,
    listUserMemories,
    createUserMemory,
    updateUserMemory,
    deleteUserMemory,
    clearUserMemories,
    postResponseFeedback,
    getAdminAiImprovementDashboard,
};
