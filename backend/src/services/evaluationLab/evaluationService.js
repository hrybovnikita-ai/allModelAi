const crypto = require('node:crypto');
const { listDatasets, getDataset, scoreDeterministic } = require('./evaluationDatasets');
const { parseEnvBoolean } = require('../../platform/featureRegistry');
const { logPlatformEvent } = require('../../platform/platformAudit');

const runsByUser = new Map();

function isEvaluationEnabled() {
    return parseEnvBoolean('FEATURE_AI_EVALUATION_LAB', true);
}

function assertEnabled() {
    if (!isEvaluationEnabled()) {
        const error = new Error('AI Evaluation Lab is disabled.');
        error.status = 503;
        error.code = 'FEATURE_DISABLED';
        throw error;
    }
}

function userRuns(email) {
    const key = String(email || '').toLowerCase();
    if (!runsByUser.has(key)) runsByUser.set(key, []);
    return runsByUser.get(key);
}

function listSuites() {
    assertEnabled();
    return listDatasets();
}

/**
 * Run evaluation prompts across models.
 * generateFn({ model, prompt }) => { text, tokens, latencyMs, estimatedCost }
 * AI-judged items are labeled — never claimed as verified objective accuracy.
 */
async function startEvaluation(connection, email, {
    datasetId,
    models = [],
    budgetUsd = Number(process.env.AI_EVAL_BUDGET_USD || 5),
    generateFn,
    ip = null,
} = {}) {
    assertEnabled();
    const dataset = getDataset(datasetId);
    if (!dataset) {
        const error = new Error('Unknown evaluation dataset');
        error.status = 400;
        throw error;
    }
    const selectedModels = (Array.isArray(models) ? models : []).map(String).filter(Boolean).slice(0, 6);
    if (!selectedModels.length) {
        const error = new Error('Select at least one model');
        error.status = 400;
        throw error;
    }
    if (typeof generateFn !== 'function') {
        const error = new Error('Evaluation generator is not configured');
        error.status = 500;
        throw error;
    }

    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const results = [];
    let spent = 0;
    let status = 'completed';
    let cancel = false;

    const run = {
        id: runId,
        email: String(email).toLowerCase(),
        datasetId,
        models: selectedModels,
        status: 'running',
        results,
        startedAt,
        cancel: () => { cancel = true; },
    };
    userRuns(email).unshift(run);

    await logPlatformEvent(connection, {
        email,
        featureId: 'ai_evaluation_lab',
        action: 'run_start',
        resourceType: 'evaluation_run',
        resourceId: runId,
        metadata: { datasetId, models: selectedModels },
        ip,
    });

    for (const item of dataset.items) {
        if (cancel) {
            status = 'cancelled';
            break;
        }
        for (const model of selectedModels) {
            if (cancel) {
                status = 'cancelled';
                break;
            }
            if (spent >= budgetUsd) {
                status = 'budget_exhausted';
                break;
            }
            const started = Date.now();
            let answer = '';
            let tokens = 0;
            let estimatedCost = 0;
            let errorMessage = null;
            try {
                const generated = await generateFn({ model, prompt: item.prompt });
                answer = generated?.text || '';
                tokens = Number(generated?.tokens || 0);
                estimatedCost = Number(generated?.estimatedCost || 0);
            } catch (error) {
                errorMessage = error.message || 'generation_failed';
            }
            const latencyMs = Date.now() - started;
            spent += estimatedCost;
            let scoring;
            if (item.deterministic) {
                scoring = scoreDeterministic(item, answer);
            } else if (item.aiJudge) {
                scoring = {
                    method: 'ai_judge',
                    passed: null,
                    score: null,
                    objective: false,
                    label: 'AI-judged (not verified objective accuracy)',
                    rubric: item.judgeRubric || null,
                };
            } else {
                scoring = { method: 'none', passed: null, score: null, objective: false };
            }
            results.push({
                itemId: item.id,
                category: dataset.id,
                model,
                prompt: item.prompt,
                answer: answer.slice(0, 4000),
                tokens,
                latencyMs,
                estimatedCost,
                errorMessage,
                scoring,
            });
        }
    }

    run.status = status;
    run.completedAt = new Date().toISOString();
    run.spentUsd = spent;
    return run;
}

function getRun(email, runId) {
    assertEnabled();
    return userRuns(email).find((run) => run.id === runId) || null;
}

function listRuns(email, { category, model, from, to } = {}) {
    assertEnabled();
    return userRuns(email).filter((run) => {
        if (category && run.datasetId !== category) return false;
        if (model && !(run.models || []).includes(model)) return false;
        if (from && run.startedAt < from) return false;
        if (to && run.startedAt > to) return false;
        return true;
    }).map((run) => ({
        id: run.id,
        datasetId: run.datasetId,
        models: run.models,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        spentUsd: run.spentUsd,
        resultCount: run.results?.length || 0,
    }));
}

function exportRun(email, runId, format = 'json') {
    const run = getRun(email, runId);
    if (!run) {
        const error = new Error('Evaluation run not found');
        error.status = 404;
        throw error;
    }
    if (format === 'csv') {
        const header = 'itemId,category,model,latencyMs,tokens,estimatedCost,method,score,passed,errorMessage';
        const lines = run.results.map((row) => [
            row.itemId,
            row.category,
            row.model,
            row.latencyMs,
            row.tokens,
            row.estimatedCost,
            row.scoring?.method,
            row.scoring?.score,
            row.scoring?.passed,
            JSON.stringify(row.errorMessage || ''),
        ].join(','));
        return { contentType: 'text/csv', body: [header, ...lines].join('\n') };
    }
    return {
        contentType: 'application/json',
        body: JSON.stringify({
            id: run.id,
            datasetId: run.datasetId,
            models: run.models,
            status: run.status,
            results: run.results,
            disclaimer: 'AI-judged scores are not verified objective accuracy.',
        }, null, 2),
    };
}

function cancelRun(email, runId) {
    const run = getRun(email, runId);
    if (!run) return { cancelled: false };
    if (typeof run.cancel === 'function') run.cancel();
    run.status = 'cancelled';
    return { cancelled: true };
}

module.exports = {
    isEvaluationEnabled,
    listSuites,
    startEvaluation,
    getRun,
    listRuns,
    exportRun,
    cancelRun,
};
