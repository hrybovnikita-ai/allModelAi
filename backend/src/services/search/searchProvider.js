/**
 * Search provider abstraction for Deep Research (Tavily primary, public web fallback).
 * Secrets stay server-side only.
 */

const { searchTavily, isTavilyConfigured, TavilyError } = require('../tavilyClient');
const webSearchService = require('../webSearchService');
const { normalizeSourceBatch } = require('../deepResearch/sourcePipeline');

class SearchProviderError extends Error {
    constructor(code, message, status = 503) {
        super(message);
        this.name = 'SearchProviderError';
        this.code = code;
        this.status = status;
    }
}

const normalizeUrlKey = (url) => String(url || '').split('#')[0].replace(/\/$/, '').toLowerCase();

const isResearchSearchAvailable = () => webSearchService.isWebSearchConfigured();

const listConfiguredProviders = () => {
    const list = [];
    if (isTavilyConfigured()) list.push('tavily');
    list.push('public');
    return list;
};

/**
 * Run planned multi-query search with real per-source callbacks.
 */
const executePlannedSearches = async ({
    userQuestion,
    queries,
    profile,
    days = null,
    signal = null,
    onSourceFound = null,
    onQueryComplete = null,
}) => {
    if (!isResearchSearchAvailable()) {
        throw new SearchProviderError(
            'search_not_configured',
            'Web research is temporarily unavailable.',
            503,
        );
    }

    const collected = [];
    const seen = new Set();
    const providersUsed = new Set();
    let calls = 0;
    const limit = Math.min(queries.length, profile.maxSearchCalls);

    for (let i = 0; i < queries.length && calls < profile.maxSearchCalls; i += 1) {
        if (signal?.aborted) {
            throw new SearchProviderError('research_cancelled', 'Research was stopped.', 499);
        }

        const query = String(queries[i] || '').trim();
        if (!query) continue;

        let batch = [];
        const useAdvanced = profile.advancedCalls > 0 && i >= queries.length - profile.advancedCalls;
        const searchDepth = useAdvanced ? 'advanced' : profile.searchDepth;

        let tavilyBatch = [];
        if (isTavilyConfigured()) {
            try {
                tavilyBatch = await searchTavily({
                    query,
                    searchDepth,
                    maxResults: profile.maxResultsPerSearch,
                    days,
                    signal,
                });
                if (tavilyBatch.length) providersUsed.add('tavily');
            } catch (error) {
                if (error instanceof TavilyError && error.code === 'tavily_not_configured') {
                    /* fall through to public */
                } else {
                    console.error('[SEARCH PROVIDER] Tavily failed:', error.code || error.message);
                }
            }
        }

        batch = normalizeSourceBatch(tavilyBatch, 'tavily');

        const minUseful = Math.min(2, profile.maxResultsPerSearch || 2);
        if (batch.length < minUseful) {
            const fallback = await webSearchService.runSearchProviders(userQuestion, [query]);
            const fallbackNormalized = normalizeSourceBatch(fallback.rawSources || [], fallback.provider || 'public');
            if (fallbackNormalized.length) {
                batch = [...batch, ...fallbackNormalized];
                if (fallback.provider && fallback.provider !== 'public') {
                    providersUsed.add(fallback.provider);
                } else {
                    providersUsed.add('public');
                }
            }
        }

        batch.forEach((source) => {
            const key = normalizeUrlKey(source.url);
            if (!key || seen.has(key)) return;
            seen.add(key);
            collected.push(source);
            onSourceFound?.(source, collected.length);
        });

        calls += 1;
        onQueryComplete?.({ query, batchSize: batch.length, totalSources: collected.length, callIndex: calls, callLimit: limit });
    }

    return {
        sources: collected,
        providersUsed: [...providersUsed],
        searchCalls: calls,
    };
};

module.exports = {
    SearchProviderError,
    TavilyError,
    isTavilyConfigured,
    isResearchSearchAvailable,
    listConfiguredProviders,
    executePlannedSearches,
    normalizeUrlKey,
};
