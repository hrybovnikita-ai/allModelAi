const { buildIntelligenceAudit } = require('../intelligence/intelligenceAudit');
const {
    assertIntelligenceAccess,
    assertOwnerForPolicyPromotion,
} = require('../intelligence/intelligenceAccess');
const {
    listCollections,
    createCollection,
    runRetrievalEval,
    getKnowledgeLearningSummary,
} = require('../intelligence/knowledgeLearningService');
const {
    buildRouterLearningDashboard,
    createCandidatePolicy,
    promoteRoutingPolicy,
} = require('../intelligence/routerLearningService');
const {
    listBenchmarkSuites,
    runDeterministicBenchmark,
    listEvalRuns,
    submitHumanReview,
} = require('../intelligence/selfEvaluationService');

const getIntelligenceAudit = async (req, res) => {
    if (!(await assertIntelligenceAccess(req, res))) return undefined;
    const audit = await buildIntelligenceAudit(req.app.locals.db);
    return res.json(audit);
};

const getLearningDashboard = async (req, res) => {
    if (!(await assertIntelligenceAccess(req, res))) return undefined;
    const connection = req.app.locals.db;
    const email = req.user.email;
    const [knowledge, router, evaluationRuns, audit] = await Promise.all([
        getKnowledgeLearningSummary(connection, email),
        buildRouterLearningDashboard(connection, { days: 14 }),
        listEvalRuns(connection, email, { limit: 10 }),
        buildIntelligenceAudit(connection),
    ]);
    return res.json({
        knowledge,
        router,
        evaluation: {
            suites: listBenchmarkSuites(),
            recentRuns: evaluationRuns,
        },
        loop: {
            status: 'connected-partial',
            flow: [
                'Knowledge Base indexing',
                'Labeled retrieval evaluation',
                'Chat responses + router_metrics',
                'Deterministic benchmark runs',
                'Candidate routing policies (manual promotion)',
            ],
        },
        auditSummary: {
            auditedAt: audit.auditedAt,
            vector: audit.infrastructure?.vector,
        },
    });
};

const getKnowledgeCollections = async (req, res) => {
    if (!(await assertIntelligenceAccess(req, res))) return undefined;
    const items = await listCollections(req.app.locals.db, req.user.email);
    return res.json({ collections: items });
};

const postKnowledgeCollection = async (req, res) => {
    if (!(await assertIntelligenceAccess(req, res))) return undefined;
    try {
        const created = await createCollection(req.app.locals.db, req.user.email, req.body || {});
        return res.status(201).json(created);
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message });
    }
};

const postKnowledgeRetrievalEval = async (req, res) => {
    if (!(await assertIntelligenceAccess(req, res))) return undefined;
    const result = await runRetrievalEval(req.app.locals.db, req.user.email, req.body || {});
    return res.json(result);
};

const getRouterLearning = async (req, res) => {
    if (!(await assertIntelligenceAccess(req, res))) return undefined;
    const dashboard = await buildRouterLearningDashboard(req.app.locals.db, {
        days: parseInt(req.query.days || '14', 10),
    });
    return res.json(dashboard);
};

const postRouterCandidatePolicy = async (req, res) => {
    if (!(await assertIntelligenceAccess(req, res))) return undefined;
    const created = await createCandidatePolicy(req.app.locals.db, req.user.email, req.body || {});
    return res.status(201).json(created);
};

const postPromoteRouterPolicy = async (req, res) => {
    if (!(await assertOwnerForPolicyPromotion(req, res))) return undefined;
    try {
        const promoted = await promoteRoutingPolicy(
            req.app.locals.db,
            req.user.email,
            String(req.body?.policyId || '').trim(),
        );
        return res.json({ promoted, note: 'Update SMART_ROUTER_POLICY in environment to apply runtime behavior.' });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message });
    }
};

const getEvaluationSuites = async (req, res) => {
    if (!(await assertIntelligenceAccess(req, res))) return undefined;
    return res.json({ suites: listBenchmarkSuites() });
};

const postEvaluationRun = async (req, res) => {
    if (!(await assertIntelligenceAccess(req, res))) return undefined;
    if (req.body?.confirmBillable === true && process.env.ALLOW_BILLABLE_EVAL !== 'true') {
        return res.status(403).json({
            message: 'Billable model evaluation is disabled. Set ALLOW_BILLABLE_EVAL=true to enable.',
            code: 'BILLABLE_EVAL_DISABLED',
        });
    }
    try {
        const outcome = await runDeterministicBenchmark(
            req.app.locals.db,
            req.user.email,
            { suiteId: String(req.body?.suiteId || '').trim() },
        );
        return res.status(201).json(outcome);
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message });
    }
};

const getEvaluationRuns = async (req, res) => {
    if (!(await assertIntelligenceAccess(req, res))) return undefined;
    const runs = await listEvalRuns(req.app.locals.db, req.user.email, {
        limit: parseInt(req.query.limit || '20', 10),
    });
    return res.json({ runs });
};

const postHumanReview = async (req, res) => {
    if (!(await assertIntelligenceAccess(req, res))) return undefined;
    try {
        const saved = await submitHumanReview(req.app.locals.db, req.user.email, req.body || {});
        return res.status(201).json(saved);
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message });
    }
};

module.exports = {
    getIntelligenceAudit,
    getLearningDashboard,
    getKnowledgeCollections,
    postKnowledgeCollection,
    postKnowledgeRetrievalEval,
    getRouterLearning,
    postRouterCandidatePolicy,
    postPromoteRouterPolicy,
    getEvaluationSuites,
    postEvaluationRun,
    getEvaluationRuns,
    postHumanReview,
};
