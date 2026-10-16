const evaluationService = require('../services/evaluationLab/evaluationService');

async function listEvaluationSuites(req, res) {
    try {
        return res.json({ suites: evaluationService.listSuites() });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function listEvaluationRuns(req, res) {
    try {
        const runs = evaluationService.listRuns(req.user.email, {
            category: req.query.category,
            model: req.query.model,
            from: req.query.from,
            to: req.query.to,
        });
        return res.json({ runs });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function startEvaluationRun(req, res) {
    try {
        const generateFn = async ({ model, prompt }) => {
            // Placeholder generator for lab scaffolding — marks planned execution without billing providers by default.
            if (process.env.AI_EVAL_LIVE_GENERATE === 'true' && typeof req.app.locals.evaluationGenerate === 'function') {
                return req.app.locals.evaluationGenerate({ model, prompt, user: req.user });
            }
            return {
                text: `[evaluation stub for ${model}] ${String(prompt).slice(0, 120)}`,
                tokens: Math.ceil(String(prompt).length / 4),
                estimatedCost: 0,
                latencyMs: 1,
            };
        };
        const run = await evaluationService.startEvaluation(req.app.locals.db, req.user.email, {
            datasetId: req.body?.datasetId,
            models: req.body?.models,
            budgetUsd: req.body?.budgetUsd,
            generateFn,
            ip: req.ip,
        });
        return res.status(202).json({
            run: {
                id: run.id,
                status: run.status,
                datasetId: run.datasetId,
                models: run.models,
                results: run.results,
                spentUsd: run.spentUsd,
                disclaimer: 'AI-judged scores are not verified objective accuracy.',
            },
        });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function getEvaluationRun(req, res) {
    try {
        const run = evaluationService.getRun(req.user.email, req.params.id);
        if (!run) return res.status(404).json({ message: 'Run not found' });
        return res.json({ run, disclaimer: 'AI-judged scores are not verified objective accuracy.' });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function exportEvaluationRun(req, res) {
    try {
        const format = String(req.query.format || 'json').toLowerCase();
        const exported = evaluationService.exportRun(req.user.email, req.params.id, format);
        res.setHeader('Content-Type', exported.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="eval-${req.params.id}.${format === 'csv' ? 'csv' : 'json'}"`);
        return res.send(exported.body);
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function cancelEvaluationRun(req, res) {
    try {
        return res.json(evaluationService.cancelRun(req.user.email, req.params.id));
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

module.exports = {
    listEvaluationSuites,
    listEvaluationRuns,
    startEvaluationRun,
    getEvaluationRun,
    exportEvaluationRun,
    cancelEvaluationRun,
};
