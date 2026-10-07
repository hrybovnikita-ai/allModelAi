const { runMultiAgentResearch } = require('../services/multiAgent/orchestrator');
const webSearchService = require('../services/webSearchService');
const deepResearchService = require('../services/deepResearchService');

async function postMultiAgentResearch(req, res) {
    const query = String(req.body.query || '').trim().slice(0, 800);
    if (!query) return res.status(400).json({ message: 'Query is required' });

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const useKnowledge = req.body.useKnowledge !== false;
    let aborted = false;
    req.on('close', () => { aborted = true; });

    try {
        const result = await runMultiAgentResearch(res, {
            query,
            email: req.user.email,
            connection: req.app.locals.db,
            useKnowledge,
            modelAllowed: () => true,
            cancelled: () => aborted,
        });

        if (result.skipped) {
            webSearchService.writeSse(res, {
                multiAgent: true,
                agentProgress: { agent: 'router', status: 'complete', summary: 'Using standard research path' },
            });
            if (req.body.fallbackDeepResearch !== false) {
                return deepResearchService.runDeepResearch(res, {
                    query,
                    modelSlug: String(req.body.model || 'gemini'),
                    depth: deepResearchService.normalizeDepth(req.body.depth || 'deep'),
                    timeRange: deepResearchService.normalizeTimeRange(req.body.timeRange),
                });
            }
            webSearchService.writeSse(res, { text: 'This question is simple enough for a single-model answer. Try Chat or enable deep research.' });
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        const reader = result.streamResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const payload = line.slice(6).trim();
                if (payload === '[DONE]') continue;
                try {
                    const json = JSON.parse(payload);
                    const delta = json.choices?.[0]?.delta?.content;
                    if (delta) webSearchService.writeSse(res, { text: delta });
                } catch {
                    // ignore partial SSE frames
                }
            }
        }

        webSearchService.writeSse(res, {
            kbSources: result.kbSources,
            webSources: webSearchService.mapSourcesForClient((result.webSources || []).slice(0, 8)),
            multiAgentComplete: true,
            runId: result.runId,
        });
        res.write('data: [DONE]\n\n');
        return res.end();
    } catch (error) {
        console.error('[MULTI_AGENT_RESEARCH]', error.message);
        webSearchService.writeSse(res, {
            error: error.message || 'Multi-agent research failed',
            code: error.code || 'multi_agent_failed',
        });
        res.write('data: [DONE]\n\n');
        return res.end();
    }
}

module.exports = {
    postMultiAgentResearch,
};
