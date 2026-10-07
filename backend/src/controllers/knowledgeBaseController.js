const knowledgeBaseService = require('../services/rag/knowledgeBaseService');
const { getOpenRouterApiKey } = require('../openRouterConfig');
const { selectSmartRoute } = require('../services/smartRouter2');
const { buildUnifiedResponse, routerMetaFromDecision } = require('../services/unifiedAiResponse');

const ALLOWED_MIME = new Set([
    'text/plain',
    'text/markdown',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

async function listKnowledgeDocuments(req, res) {
    const docs = await knowledgeBaseService.listDocuments(req.app.locals.db, req.user.email);
    return res.json({ documents: docs });
}

async function uploadKnowledgeDocument(req, res) {
    const name = String(req.body.name || '').trim();
    const mimeType = String(req.body.mimeType || 'text/plain').trim();
    const content = String(req.body.content || '');
    const pages = Array.isArray(req.body.pages) ? req.body.pages : null;

    if (!name) return res.status(400).json({ message: 'Document name is required' });
    if (!content.trim() && !pages?.length) {
        return res.status(400).json({ message: 'Document text content is required' });
    }
    if (mimeType && !ALLOWED_MIME.has(mimeType) && !/^text\//.test(mimeType)) {
        return res.status(400).json({ message: 'Unsupported file type' });
    }
    if (content.length > knowledgeBaseService.MAX_UPLOAD_CHARS) {
        return res.status(400).json({ message: 'Document exceeds maximum size' });
    }

    try {
        const result = await knowledgeBaseService.indexDocument(req.app.locals.db, req.user.email, {
            name,
            mimeType,
            content,
            pages,
        });
        return res.status(201).json(result);
    } catch (error) {
        const status = error.status || 500;
        return res.status(status).json({ message: error.message || 'Could not index document' });
    }
}

async function deleteKnowledgeDocument(req, res) {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ message: 'Document id required' });
    await knowledgeBaseService.deleteDocument(req.app.locals.db, req.user.email, id);
    return res.json({ deleted: true, id });
}

async function reindexKnowledgeDocument(req, res) {
    const id = String(req.params.id || '').trim();
    const body = req.body || {};
    if (!id) return res.status(400).json({ message: 'Document id required' });
    const result = await knowledgeBaseService.indexDocument(req.app.locals.db, req.user.email, {
        id,
        name: body.name,
        mimeType: body.mimeType,
        content: body.content,
        pages: body.pages,
    });
    return res.json(result);
}

async function queryKnowledgeBase(req, res) {
    const query = String(req.body.query || '').trim();
    if (!query) return res.status(400).json({ message: 'Query is required' });

    const topK = Math.min(Number(req.body.topK) || 6, 12);
    const kb = await knowledgeBaseService.answerWithKnowledge(req.app.locals.db, req.user.email, query, topK);
    const route = selectSmartRoute(query, { routerMode: 'quality', useKnowledge: true, modelAllowed: () => true });

    if (!kb.grounded) {
        return res.json(buildUnifiedResponse({
            text: kb.message,
            router: routerMetaFromDecision(route),
            sources: [],
        }));
    }

    const gatewayKey = getOpenRouterApiKey();
    if (!gatewayKey?.trim()) {
        return res.json(buildUnifiedResponse({
            text: `${kb.message}\n\nRetrieved context (no LLM key configured for synthesis):\n${kb.contextBlock}`,
            router: routerMetaFromDecision(route),
            sources: kb.sources,
        }));
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(45000),
        headers: {
            Authorization: `Bearer ${gatewayKey.trim()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            max_tokens: 1200,
            temperature: 0.25,
            messages: [
                {
                    role: 'system',
                    content: 'Answer using ONLY the provided knowledge excerpts. Cite sources as [1], [2]. If insufficient, say the Knowledge Base lacks enough information.',
                },
                {
                    role: 'user',
                    content: `Question: ${query}\n\nExcerpts:\n${kb.contextBlock}`,
                },
            ],
        }),
    });

    if (!response.ok) {
        return res.status(502).json({ message: 'Could not generate grounded answer' });
    }
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || kb.message;

    return res.json(buildUnifiedResponse({
        text,
        provider: 'openrouter',
        model: 'google/gemini-2.5-flash',
        router: routerMetaFromDecision(route),
        sources: kb.sources,
        usage: data.usage || {},
    }));
}

module.exports = {
    listKnowledgeDocuments,
    uploadKnowledgeDocument,
    deleteKnowledgeDocument,
    reindexKnowledgeDocument,
    queryKnowledgeBase,
};
