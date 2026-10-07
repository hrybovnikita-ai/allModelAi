/**
 * Deep Research SSE events (real backend state only).
 */

const webSearchService = require('../webSearchService');

const STAGE_FROM_EVENT = {
    'research.started': 'understanding',
    'research.plan_created': 'planning',
    'search.started': 'searching',
    'search.completed': 'reading',
    'analysis.started': 'analyzing',
    'analysis.completed': 'analyzing',
    'verification.started': 'cross_check',
    'verification.completed': 'cross_check',
    'writing.started': 'writing',
    'writing.completed': 'writing',
    'research.completed': 'done',
    'research.failed': 'failed',
};

const LABEL_FROM_STAGE = {
    understanding: 'Understanding your goal',
    planning: 'Building research plan',
    searching: 'Searching the web',
    reading: 'Reading sources',
    analyzing: 'Analyzing evidence',
    cross_check: 'Cross-checking claims',
    verification: 'Verifying sources',
    writing: 'Preparing report',
};

const writeResearchEvent = (res, type, payload = {}) => {
    const stage = STAGE_FROM_EVENT[type] || payload.deepResearchStage;
    const deepResearchLabel = payload.deepResearchLabel
        || (stage ? LABEL_FROM_STAGE[stage] : undefined);

    webSearchService.writeSse(res, {
        deepResearch: true,
        researchEvent: type,
        deepResearchStage: stage || payload.deepResearchStage,
        deepResearchLabel,
        webSearchStatus: stage || payload.webSearchStatus,
        ...payload,
    });
};

module.exports = {
    STAGE_FROM_EVENT,
    LABEL_FROM_STAGE,
    writeResearchEvent,
};
