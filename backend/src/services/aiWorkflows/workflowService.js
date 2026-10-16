const crypto = require('node:crypto');
const { isPostgresConnection } = require('../../db/postgresHttpReads');
const { ensureWorkflowSchema } = require('./workflowSchema');
const { validateWorkflowGraph, topologicalOrder, WORKFLOW_TEMPLATES } = require('./workflowGraph');
const { parseEnvBoolean } = require('../../platform/featureRegistry');
const { logPlatformEvent } = require('../../platform/platformAudit');

function isWorkflowsEnabled() {
    return parseEnvBoolean('FEATURE_AI_WORKFLOWS', true);
}

function assertEnabled() {
    if (!isWorkflowsEnabled()) {
        const error = new Error('AI Workflows are disabled.');
        error.status = 503;
        error.code = 'FEATURE_DISABLED';
        throw error;
    }
}

function nowIso() {
    return new Date().toISOString();
}

function ensureSqlite(connection) {
    if (!isPostgresConnection(connection) && connection?.database) {
        ensureWorkflowSchema(connection.database);
    }
}

function listTemplates() {
    assertEnabled();
    return WORKFLOW_TEMPLATES;
}

function listWorkflows(connection, email) {
    assertEnabled();
    ensureSqlite(connection);
    if (isPostgresConnection(connection)) {
        // Async PG path can be added with migrate 014; SQLite covers local/dev.
        return [];
    }
    return connection.database.prepare(
        `SELECT id, name, description, graph_json AS graphJson, template_id AS templateId,
                created_at AS createdAt, updated_at AS updatedAt
         FROM ai_workflows WHERE email = ? ORDER BY updated_at DESC LIMIT 100`,
    ).all(String(email).toLowerCase()).map((row) => ({
        ...row,
        graph: JSON.parse(row.graphJson || '{}'),
    }));
}

function saveWorkflow(connection, email, { id, name, description, graph, templateId } = {}) {
    assertEnabled();
    ensureSqlite(connection);
    validateWorkflowGraph(graph);
    const workflowId = id || crypto.randomUUID();
    const stamp = nowIso();
    const owner = String(email).toLowerCase();
    if (isPostgresConnection(connection)) {
        const error = new Error('Workflow persistence on Postgres requires migration 014. Use SQLite locally or run db:migrate.');
        error.status = 501;
        throw error;
    }
    connection.database.prepare(
        `INSERT INTO ai_workflows (id, email, name, description, graph_json, template_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           description=excluded.description,
           graph_json=excluded.graph_json,
           template_id=excluded.template_id,
           updated_at=excluded.updated_at
         WHERE ai_workflows.email = excluded.email`,
    ).run(
        workflowId,
        owner,
        String(name || 'Untitled workflow').trim(),
        description || null,
        JSON.stringify(graph),
        templateId || null,
        stamp,
        stamp,
    );
    return { id: workflowId, name, description, graph, templateId, updatedAt: stamp };
}

function getWorkflow(connection, email, id) {
    assertEnabled();
    ensureSqlite(connection);
    if (isPostgresConnection(connection)) return null;
    const row = connection.database.prepare(
        `SELECT id, name, description, graph_json AS graphJson, template_id AS templateId,
                created_at AS createdAt, updated_at AS updatedAt
         FROM ai_workflows WHERE id = ? AND email = ?`,
    ).get(id, String(email).toLowerCase());
    if (!row) return null;
    return { ...row, graph: JSON.parse(row.graphJson || '{}') };
}

function deleteWorkflow(connection, email, id) {
    assertEnabled();
    ensureSqlite(connection);
    if (isPostgresConnection(connection)) return { deleted: false };
    const info = connection.database.prepare(
        'DELETE FROM ai_workflows WHERE id = ? AND email = ?',
    ).run(id, String(email).toLowerCase());
    connection.database.prepare(
        'DELETE FROM ai_workflow_runs WHERE workflow_id = ? AND email = ?',
    ).run(id, String(email).toLowerCase());
    return { deleted: info.changes > 0 };
}

/**
 * Execute a workflow synchronously for short graphs (async job enqueue can wrap this).
 * Does not call providers here — returns ordered step plan + stub outputs for safe tests.
 * Live provider execution is opt-in via executeStep callback.
 */
async function startRun(connection, email, workflowId, {
    inputText = '',
    budgetTokens = Number(process.env.AI_WORKFLOW_BUDGET_TOKENS || 50_000),
    executeStep = null,
    ip = null,
} = {}) {
    assertEnabled();
    ensureSqlite(connection);
    const workflow = getWorkflow(connection, email, workflowId);
    if (!workflow) {
        const error = new Error('Workflow not found');
        error.status = 404;
        throw error;
    }
    const order = topologicalOrder(workflow.graph);
    const runId = crypto.randomUUID();
    const stamp = nowIso();
    const owner = String(email).toLowerCase();
    const progress = { steps: order.map((node) => ({ id: node.id, status: 'pending' })) };

    if (!isPostgresConnection(connection)) {
        connection.database.prepare(
            `INSERT INTO ai_workflow_runs
             (id, workflow_id, email, status, progress_json, budget_tokens, used_tokens, created_at, updated_at)
             VALUES (?, ?, ?, 'running', ?, ?, 0, ?, ?)`,
        ).run(runId, workflowId, owner, JSON.stringify(progress), budgetTokens, stamp, stamp);
    }

    await logPlatformEvent(connection, {
        email: owner,
        featureId: 'ai_workflows',
        action: 'run_start',
        resourceType: 'workflow_run',
        resourceId: runId,
        metadata: { workflowId, steps: order.length },
        ip,
    });

    const outputs = {};
    let usedTokens = 0;
    let status = 'completed';
    let errorMessage = null;

    for (let i = 0; i < order.length; i += 1) {
        const node = order[i];
        if (!isPostgresConnection(connection)) {
            const run = connection.database.prepare(
                'SELECT cancel_requested AS cancelRequested FROM ai_workflow_runs WHERE id = ? AND email = ?',
            ).get(runId, owner);
            if (run?.cancelRequested) {
                status = 'cancelled';
                errorMessage = 'Cancelled by user';
                break;
            }
        }
        progress.steps[i].status = 'running';
        try {
            const prior = Object.values(outputs).join('\n\n');
            const prompt = `${node.prompt || ''}\n\nInput:\n${inputText}\n\nPrior steps:\n${prior}`.trim();
            let stepResult = { text: `[planned] ${node.label || node.id} via ${node.model}`, tokens: 0 };
            if (typeof executeStep === 'function') {
                stepResult = await executeStep(node, { prompt, inputText, priorOutputs: outputs });
            }
            outputs[node.id] = stepResult.text || '';
            usedTokens += Number(stepResult.tokens || 0);
            if (usedTokens > budgetTokens) {
                status = 'failed';
                errorMessage = 'Token budget exceeded';
                progress.steps[i].status = 'failed';
                break;
            }
            progress.steps[i].status = 'completed';
        } catch (error) {
            status = 'failed';
            errorMessage = error.message || 'Step failed';
            progress.steps[i].status = 'failed';
            break;
        }
    }

    if (!isPostgresConnection(connection)) {
        connection.database.prepare(
            `UPDATE ai_workflow_runs
             SET status = ?, progress_json = ?, result_json = ?, error_message = ?, used_tokens = ?, updated_at = ?
             WHERE id = ? AND email = ?`,
        ).run(
            status,
            JSON.stringify(progress),
            JSON.stringify({ outputs }),
            errorMessage,
            usedTokens,
            nowIso(),
            runId,
            owner,
        );
    }

    return {
        id: runId,
        workflowId,
        status,
        progress,
        outputs,
        usedTokens,
        budgetTokens,
        errorMessage,
    };
}

function cancelRun(connection, email, runId) {
    assertEnabled();
    ensureSqlite(connection);
    if (isPostgresConnection(connection)) return { cancelled: false };
    const info = connection.database.prepare(
        `UPDATE ai_workflow_runs SET cancel_requested = 1, updated_at = ? WHERE id = ? AND email = ? AND status = 'running'`,
    ).run(nowIso(), runId, String(email).toLowerCase());
    return { cancelled: info.changes > 0 };
}

function getRun(connection, email, runId) {
    assertEnabled();
    ensureSqlite(connection);
    if (isPostgresConnection(connection)) return null;
    const row = connection.database.prepare(
        `SELECT id, workflow_id AS workflowId, status, progress_json AS progressJson,
                result_json AS resultJson, error_message AS errorMessage, budget_tokens AS budgetTokens,
                used_tokens AS usedTokens, created_at AS createdAt, updated_at AS updatedAt
         FROM ai_workflow_runs WHERE id = ? AND email = ?`,
    ).get(runId, String(email).toLowerCase());
    if (!row) return null;
    return {
        ...row,
        progress: JSON.parse(row.progressJson || '{}'),
        result: JSON.parse(row.resultJson || '{}'),
    };
}

module.exports = {
    isWorkflowsEnabled,
    listTemplates,
    listWorkflows,
    saveWorkflow,
    getWorkflow,
    deleteWorkflow,
    startRun,
    cancelRun,
    getRun,
};
