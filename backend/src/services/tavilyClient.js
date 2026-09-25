/**
 * Server-only Tavily Search API client. Never expose TAVILY_API_KEY to clients.
 * @see https://docs.tavily.com/documentation/api-reference/endpoint/search
 */

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const DEFAULT_TIMEOUT_MS = 20000;

class TavilyError extends Error {
    constructor(code, message, status) {
        super(message);
        this.name = 'TavilyError';
        this.code = code;
        this.status = status || 502;
    }
}

const getApiKey = () => {
    const key = process.env.TAVILY_API_KEY?.trim();
    if (!key) return null;
    return key;
};

const mapTavilyFailure = (status, bodyText) => {
    const lower = String(bodyText || '').toLowerCase();
    if (status === 401 || status === 403 || lower.includes('invalid api key') || lower.includes('unauthorized')) {
        return new TavilyError('tavily_auth', 'Tavily API authentication failed. Check TAVILY_API_KEY on the server.', status);
    }
    if (status === 429 || lower.includes('rate limit')) {
        return new TavilyError('tavily_rate_limit', 'Tavily rate limit reached. Try again in a few minutes.', status);
    }
    if (status === 402 || lower.includes('quota') || lower.includes('credit') || lower.includes('exhausted')) {
        return new TavilyError('tavily_quota', 'Tavily monthly search credits are exhausted. Upgrade your Tavily plan or try again next month.', status);
    }
    if (status === 400 || lower.includes('invalid') && lower.includes('query')) {
        return new TavilyError('invalid_query', 'The research query is invalid. Try a shorter, clearer question.', status);
    }
    return new TavilyError('tavily_error', 'Tavily search failed. Please try again later.', status);
};

/**
 * @param {object} options
 * @param {string} options.query
 * @param {'basic'|'advanced'} [options.searchDepth]
 * @param {number} [options.maxResults]
 * @param {number|null} [options.days] - recency filter (news-style)
 * @param {AbortSignal} [options.signal]
 */
const searchTavily = async ({
    query,
    searchDepth = 'basic',
    maxResults = 5,
    days = null,
    signal,
}) => {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new TavilyError('tavily_not_configured', 'Deep Research is not configured on the server (missing TAVILY_API_KEY).', 503);
    }

    const q = String(query || '').trim();
    if (!q || q.length < 2) {
        throw new TavilyError('invalid_query', 'Research query is too short.', 400);
    }

    const body = {
        api_key: apiKey,
        query: q.slice(0, 400),
        search_depth: searchDepth === 'advanced' ? 'advanced' : 'basic',
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        max_results: Math.min(Math.max(Number(maxResults) || 5, 1), 10),
        topic: 'general',
    };
    if (days && Number(days) > 0) {
        body.days = Math.min(Number(days), 365);
    }

    let response;
    try {
        response = await fetch(TAVILY_SEARCH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: signal || AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });
    } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
            throw new TavilyError('tavily_timeout', 'Tavily search timed out. Try Quick depth or a narrower question.', 504);
        }
        throw new TavilyError('tavily_network', 'Could not reach Tavily. Check your network connection and try again.', 502);
    }

    const raw = await response.text();
    let data = {};
    try {
        data = raw ? JSON.parse(raw) : {};
    } catch {
        data = {};
    }

    if (!response.ok) {
        const detail = data.detail || data.error || raw.slice(0, 200);
        throw mapTavilyFailure(response.status, String(detail));
    }

    const results = Array.isArray(data.results) ? data.results : [];
    return results
        .filter((item) => item && typeof item.url === 'string' && /^https?:\/\//i.test(item.url))
        .map((item, index) => ({
            title: String(item.title || 'Untitled').slice(0, 300),
            url: item.url,
            excerpt: String(item.content || '').slice(0, 1200),
            score: typeof item.score === 'number' ? item.score : null,
            publishedDate: item.published_date || item.publishedDate || null,
            domain: extractDomain(item.url),
        }))
        .filter((item) => item.title && item.url);
};

const extractDomain = (url) => {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host.replace(/^www\./, '');
    } catch {
        return '';
    }
};

module.exports = {
    TavilyError,
    getApiKey,
    searchTavily,
    extractDomain,
};
