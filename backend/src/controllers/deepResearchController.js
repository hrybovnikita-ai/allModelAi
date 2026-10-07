const deepResearchService = require('../services/deepResearchService');

async function postResearchClarify(req, res) {
    const query = String(req.body.query || '').trim().slice(0, 500);
    if (!query) return res.status(400).json({ message: 'Research query is required' });

    const skipClarification = Boolean(req.body.skipClarification);
    try {
        const payload = await deepResearchService.buildClarificationPayload({ query, skipClarification });
        const searchAvailable = deepResearchService.isResearchSearchAvailable();
        return res.json({
            ...payload,
            searchAvailable,
            providers: deepResearchService.listConfiguredProviders(),
        });
    } catch (error) {
        console.error('[DEEP RESEARCH CLARIFY]', error.message);
        return res.status(502).json({ message: 'Could not analyze this research request.' });
    }
}

async function getResearchConfig(req, res) {
    const isDev = process.env.NODE_ENV !== 'production';
    const available = deepResearchService.isResearchSearchAvailable();
    return res.json({
        searchAvailable: available,
        providers: deepResearchService.listConfiguredProviders(),
        profiles: Object.keys(deepResearchService.DEPTH_PROFILES),
        ...(isDev && !available
            ? { developerHint: 'Configure TAVILY_API_KEY or ensure public web search endpoints are reachable.' }
            : {}),
    });
}

module.exports = {
    postResearchClarify,
    getResearchConfig,
};
