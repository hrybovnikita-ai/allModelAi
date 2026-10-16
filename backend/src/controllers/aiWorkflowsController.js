const workflowService = require('../services/aiWorkflows/workflowService');

async function listWorkflowTemplates(req, res) {
    try {
        return res.json({ templates: workflowService.listTemplates() });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function listWorkflows(req, res) {
    try {
        return res.json({ workflows: workflowService.listWorkflows(req.app.locals.db, req.user.email) });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function saveWorkflow(req, res) {
    try {
        const saved = workflowService.saveWorkflow(req.app.locals.db, req.user.email, req.body || {});
        return res.status(201).json(saved);
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function getWorkflow(req, res) {
    try {
        const workflow = workflowService.getWorkflow(req.app.locals.db, req.user.email, req.params.id);
        if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
        return res.json({ workflow });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function deleteWorkflow(req, res) {
    try {
        return res.json(workflowService.deleteWorkflow(req.app.locals.db, req.user.email, req.params.id));
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function startWorkflowRun(req, res) {
    try {
        const run = await workflowService.startRun(req.app.locals.db, req.user.email, req.params.id, {
            inputText: req.body?.inputText || '',
            budgetTokens: req.body?.budgetTokens,
            ip: req.ip,
        });
        return res.status(202).json({ run });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function getWorkflowRun(req, res) {
    try {
        const run = workflowService.getRun(req.app.locals.db, req.user.email, req.params.runId);
        if (!run) return res.status(404).json({ message: 'Run not found' });
        return res.json({ run });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function cancelWorkflowRun(req, res) {
    try {
        return res.json(workflowService.cancelRun(req.app.locals.db, req.user.email, req.params.runId));
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

module.exports = {
    listWorkflowTemplates,
    listWorkflows,
    saveWorkflow,
    getWorkflow,
    deleteWorkflow,
    startWorkflowRun,
    getWorkflowRun,
    cancelWorkflowRun,
};
