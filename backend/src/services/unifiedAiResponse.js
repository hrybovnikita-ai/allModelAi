/**
 * Normalized AI response envelope for chat, research, and knowledge flows.
 */

function buildUnifiedResponse(parts = {}) {
    const response = {
        text: parts.text ?? '',
    };
    if (parts.provider) response.provider = parts.provider;
    if (parts.model) response.model = parts.model;
    if (parts.router) response.router = parts.router;
    if (Array.isArray(parts.sources) && parts.sources.length) response.sources = parts.sources;
    if (Array.isArray(parts.agents) && parts.agents.length) response.agents = parts.agents;
    if (parts.usage && Object.keys(parts.usage).length) response.usage = parts.usage;
    if (parts.timing && Object.keys(parts.timing).length) response.timing = parts.timing;
    return response;
}

function routerMetaFromDecision(decision, fallbackUsed = false) {
    if (!decision) return undefined;
    return {
        taskType: decision.taskType || decision.category,
        reason: decision.reason,
        fallbackUsed: Boolean(fallbackUsed),
        selectedProvider: decision.selectedProvider,
        selectedModel: decision.selectedModel || decision.displayName,
        fallbacks: decision.fallbacks || [],
    };
}

module.exports = {
    buildUnifiedResponse,
    routerMetaFromDecision,
};
