/**
 * Phase 1 — repository audit snapshot (no fabricated metrics).
 */
const { probePgVector } = require('../platform/vectorStoreProbe');
const { POLICY_VERSION, isAdaptiveRouterEnabled } = require('../services/smartRouter2/routerPolicy');
const { isPostgresConnection } = require('../db/postgresHttpReads');

function auditExistingModules() {
    return {
        knowledge: {
            service: 'services/rag/knowledgeBaseService.js',
            embedding: 'services/rag/embeddingProvider.js (local hash + optional OpenAI)',
            retrieval: 'services/rag/retriever.js (cosine + lexical fallback)',
            tables: ['knowledge_documents', 'knowledge_chunks'],
            frontend: 'components/KnowledgeBase/KnowledgeBasePage.jsx',
            gaps: [
                'PDF/DOCX server-side parsing pipeline',
                'Collections UI',
                'Labeled retrieval evaluation storage',
                'Async indexing jobs via platform jobs',
            ],
        },
        smartRouter: {
            service: 'services/smartRouter2/*',
            telemetry: 'services/smartRouter2/telemetry.js → router_metrics',
            policy: `routerPolicy.js (SMART_ROUTER_POLICY=${POLICY_VERSION}, adaptive=${isAdaptiveRouterEnabled()})`,
            tables: ['router_metrics'],
            gaps: [
                'Task-category model scoring dashboard',
                'Candidate policy promotion workflow',
                'Shadow routing',
            ],
        },
        selfEvaluation: {
            feedback: 'services/responseFeedbackService.js',
            adminDashboard: 'GET /api/admin/ai-improvement',
            workspaceEvaluations: 'workspace type evaluation (basic)',
            modelDiagnostics: 'developer/model-diagnostics',
            gaps: [
                'Versioned benchmark suites',
                'Deterministic eval runner persistence',
                'AI judge with rubric versioning',
                'Human review queue',
            ],
        },
        connectedLoop: {
            status: 'planned',
            note: 'Shared identifiers will flow: taskType → router_metrics → eval runs → KB retrieval evals',
        },
    };
}

async function buildIntelligenceAudit(connection) {
    const vector = await probePgVector(connection);
    let tableCounts = {};
    try {
        if (isPostgresConnection(connection)) {
            tableCounts = { note: 'Use learning dashboard for live counts' };
        } else if (connection?.database) {
            const db = connection.database;
            const safeCount = (table) => {
                try {
                    return db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get()?.c || 0;
                } catch {
                    return null;
                }
            };
            tableCounts = {
                knowledge_documents: safeCount('knowledge_documents'),
                knowledge_chunks: safeCount('knowledge_chunks'),
                router_metrics: safeCount('router_metrics'),
                response_feedback: safeCount('response_feedback'),
            };
        }
    } catch {
        tableCounts = {};
    }

    return {
        auditedAt: new Date().toISOString(),
        phase: 1,
        modules: auditExistingModules(),
        infrastructure: { vector },
        tableCounts,
        principles: [
            'No proprietary model weight updates',
            'No fabricated evaluation scores',
            'Retrieval metrics only with labeled data',
            'Router policy promotion requires owner approval',
        ],
    };
}

module.exports = {
    buildIntelligenceAudit,
    auditExistingModules,
};
