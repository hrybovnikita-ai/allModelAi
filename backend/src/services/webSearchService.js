/**
 * Web search collection, ranking, and AI synthesis for AllModelAI.
 * Search uses public Bing RSS, DuckDuckGo HTML, and Wikipedia — no frontend API keys.
 */

const { getOpenRouterApiKey } = require('../openRouterConfig');
const { isTavilyConfigured, searchTavily } = require('./tavilyClient');
const {
    MIN_RELEVANCE_SCORE,
    detectQueryProfile,
    isClearlyUnrelated,
    meaningfulTokens,
    needsSearchRetry,
    scoreSourceRelevance,
} = require('./webSearchRelevance');
const {
    buildIntentAwareSearchQueries,
    extractSearchIntent,
    isQueryDegenerate,
} = require('./webSearchQueryBuilder');
const { computeAuthorityScore, combineRelevanceAndAuthority } = require('./webSourceAuthority');
const {
    buildCitationInstructions,
    finalizeRankedSources,
    formatSourceContextForModel,
    mapSourcesForClient,
} = require('./webSourceCitations');

const USER_AGENT = 'Mozilla/5.0 (compatible; AllModelAI/1.0; +https://allmodelai.local)';

const STOP_WORDS = new Set([
    'the', 'best', 'for', 'me', 'find', 'a', 'an', 'is', 'are', 'what', 'how', 'tell', 'show', 'get',
    'please', 'can', 'you', 'could', 'would', 'some', 'any', 'top', 'good', 'great', 'list', 'give',
]);

const LOW_QUALITY_PATTERNS = [
    /pixabay\.com/i,
    /zhihu\.com/i,
    /pinterest\.(com|ru)/i,
    /freepik\.com/i,
    /shutterstock\.com/i,
    /alamy\.com/i,
    /istockphoto\.com/i,
    /dreamstime\.com/i,
    /wallpaper/i,
    /stock.?photo/i,
    /unsplash\.com/i,
    /lowyat\.net/i,
    /answers\.microsoft\.com/i,
    /support\.google\.com/i,
    /quora\.com/i,
];

const TECH_AUTHORITY_BONUS = [
    { pattern: /realpython\.com/i, bonus: 35 },
    { pattern: /python\.org/i, bonus: 40 },
    { pattern: /docs\.python\.org/i, bonus: 45 },
    { pattern: /djangoproject\.com/i, bonus: 40 },
    { pattern: /flask\.palletsprojects\.com/i, bonus: 40 },
    { pattern: /fastapi\.tiangolo\.com/i, bonus: 40 },
    { pattern: /stackoverflow\.com/i, bonus: 28 },
    { pattern: /dev\.to/i, bonus: 22 },
    { pattern: /medium\.com/i, bonus: 18 },
    { pattern: /github\.com/i, bonus: 25 },
    { pattern: /w3schools\.com/i, bonus: 20 },
    { pattern: /geeksforgeeks\.org/i, bonus: 20 },
    { pattern: /freecodecamp\.org/i, bonus: 22 },
];

const AUTHORITY_BONUS = [
    { pattern: /(^|\.)apple\.com$/i, bonus: 45 },
    { pattern: /(^|\.)microsoft\.com$/i, bonus: 40 },
    { pattern: /(^|\.)google\.com$/i, bonus: 35 },
    { pattern: /support\./i, bonus: 25 },
    { pattern: /(^|\.)wikipedia\.org$/i, bonus: 18 },
    { pattern: /(^|\.)gov(\.|$)/i, bonus: 35 },
    { pattern: /(^|\.)edu(\.|$)/i, bonus: 30 },
    { pattern: /macrumors\.com/i, bonus: 22 },
    { pattern: /theverge\.com/i, bonus: 20 },
    { pattern: /techcrunch\.com/i, bonus: 20 },
    { pattern: /reuters\.com/i, bonus: 25 },
    { pattern: /bbc\.(com|co\.uk)/i, bonus: 22 },
    { pattern: /nytimes\.com/i, bonus: 20 },
    { pattern: /wsj\.com/i, bonus: 20 },
    { pattern: /bloomberg\.com/i, bonus: 20 },
];

const decodeHtml = (value) => String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const extractDomain = (url) => {
    try {
        const host = new URL(url.startsWith('//') ? `https:${url}` : url).hostname.toLowerCase();
        return host.replace(/^www\./, '');
    } catch {
        return '';
    }
};

const tokenize = (text) => [...new Set(String(text || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])];

const localMeaningfulTokens = (text) => tokenize(text).filter((token) => !STOP_WORDS.has(token));

const { classifyChatIntent } = require('./chatIntent');

const detectQueryIntent = (text) => {
    const lower = String(text || '').toLowerCase();
    const chatIntent = classifyChatIntent(text);
    return {
        isPythonWebFrameworks: /python/i.test(lower) && /framework|library|django|flask|fastapi|starlette|tornado|pyramid|bottle|web\s+(dev|app|development|framework)/i.test(lower),
        isCoding: chatIntent.coding,
        isPrice: /price|pricing|cost|how much|сколько|стоим|цена|usd|\$/i.test(lower),
        isWeather: /weather|погод/i.test(lower),
        isNews: /latest|news|today|current|новост|сегодня|актуал/i.test(lower),
        languages: {
            python: /python|django|flask|fastapi/i.test(lower),
            javascript: /javascript|typescript|node|react|vue|angular/i.test(lower),
        },
    };
};

const needsCurrentInformation = (prompt) => {
    const { needsWebSearchForPrompt } = require('./chatIntent');
    return needsWebSearchForPrompt(prompt);
};

const buildSearchQuery = (userQuestion) => buildIntentAwareSearchQueries(userQuestion).primary;

const buildAlternateSearchQueries = (userQuestion) => buildIntentAwareSearchQueries(userQuestion).queries;

const isOffTopicSource = (userQuestion, source) => {
    const intent = detectQueryIntent(userQuestion);
    const blob = `${source.title} ${source.excerpt} ${source.domain}`.toLowerCase();

    if (intent.isPythonWebFrameworks || (intent.isCoding && intent.languages.python)) {
        if (/whatsapp|watsapp|telegram|instagram|facebook|messenger|hacked|browser down|chrome default|google play|gmail|classroom|маршрут|браузер|google chrome/i.test(blob)) {
            return true;
        }
        if (!/python|django|flask|fastapi|framework|backend|web dev|programming|developer|api/i.test(blob)) {
            return true;
        }
    }

    if (intent.isCoding && !intent.languages.python) {
        if (/whatsapp|watsapp|hacked/i.test(blob) && !/javascript|typescript|react|node|framework/i.test(blob)) {
            return true;
        }
    }

    return false;
};

const scoreSource = (userQuestion, source, rankIndex) => {
    if (isOffTopicSource(userQuestion, source) || isClearlyUnrelated(userQuestion, source)) {
        return -100;
    }

    let { score, relevanceScore } = scoreSourceRelevance(userQuestion, source, rankIndex);
    const domain = source.domain || extractDomain(source.url);
    [...TECH_AUTHORITY_BONUS].forEach((entry) => {
        const pattern = entry.pattern || entry;
        const bonus = entry.bonus || 18;
        if (relevanceScore >= 25 && (pattern.test(domain) || pattern.test(source.url))) {
            score += bonus;
        }
    });
    source.relevanceScore = Math.max(0, Math.min(100, relevanceScore));

    if (LOW_QUALITY_PATTERNS.some((pattern) => pattern.test(source.url) || pattern.test(source.title) || pattern.test(source.domain))) {
        return score - 50;
    }

    if (/youtube\.com|youtu\.be/i.test(source.url) && !/video|review|hands.?on|tutorial|обзор/i.test(userQuestion)) {
        return score - 15;
    }

    return score;
};

const dedupeSources = (sources) => {
    const seen = new Map();
    sources.forEach((source) => {
        const domain = source.domain || extractDomain(source.url);
        const key = `${domain}::${String(source.title || '').slice(0, 60).toLowerCase()}`;
        const existing = seen.get(key);
        if (!existing || (source.score || 0) > (existing.score || 0)) {
            seen.set(key, { ...source, domain });
        }
    });
    return [...seen.values()];
};

const rankSources = (userQuestion, sources, limit = 6) => {
    const intent = extractSearchIntent(userQuestion);
    const enriched = dedupeSources(sources).map((source, index) => {
        const score = scoreSource(userQuestion, source, index);
        const relevanceScore = source.relevanceScore ?? 0;
        const relevancePassed = score >= MIN_RELEVANCE_SCORE;
        const authority = computeAuthorityScore(source, intent);
        const combinedScore = combineRelevanceAndAuthority(relevanceScore, authority.authorityScore, relevancePassed);
        return {
            ...source,
            ...authority,
            score,
            relevanceScore,
            combinedScore,
            excerpt: String(source.excerpt || '').slice(0, 320),
            snippet: String(source.excerpt || source.snippet || '').slice(0, 320),
        };
    });
    return finalizeRankedSources(userQuestion, enriched, limit);
};

const resolveSearchSignal = (signal, timeoutMs = 12000) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    if (!signal) return timeout;
    if (typeof AbortSignal.any === 'function') {
        return AbortSignal.any([signal, timeout]);
    }
    return signal;
};

const searchBing = async (searchQuery, { signal = null } = {}) => {
    const response = await fetch(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(searchQuery)}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: resolveSearchSignal(signal),
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 10).map((match) => {
        const item = match[1];
        const value = (tag) => decodeHtml(item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') || '');
        const url = value('link');
        const publishedRaw = value('pubDate') || value('published') || '';
        const publishedMs = publishedRaw ? Date.parse(publishedRaw) : NaN;
        return {
            title: value('title'),
            url,
            excerpt: value('description').slice(0, 700),
            domain: extractDomain(url),
            publishedDate: Number.isFinite(publishedMs) ? new Date(publishedMs).toISOString().slice(0, 10) : (publishedRaw || null),
        };
    }).filter((source) => source.title && /^https?:\/\//.test(source.url));
};

const searchDuckDuckGo = async (searchQuery, { signal = null } = {}) => {
    const response = await fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({ q: searchQuery }).toString(),
        signal: resolveSearchSignal(signal),
    });
    if (!response.ok) return [];
    const html = await response.text();
    const links = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>|class="result__snippet"[^>]*>([\s\S]*?)<\/div>/gi)];
    return links.slice(0, 10).map((match, index) => {
        let url = match[1].replaceAll('&amp;', '&');
        try {
            const parsed = new URL(url.startsWith('//') ? `https:${url}` : url);
            url = parsed.searchParams.get('uddg') ? decodeURIComponent(parsed.searchParams.get('uddg')) : url;
        } catch { /* keep original */ }
        return {
            title: decodeHtml(match[2]),
            url,
            excerpt: decodeHtml(snippets[index]?.[1] || snippets[index]?.[2] || 'Open this result to read more.').slice(0, 700),
            domain: extractDomain(url),
        };
    }).filter((source) => /^https?:\/\//.test(source.url));
};

const searchWikipedia = async (searchQuery, { signal = null } = {}) => {
    const { resolveResponseLanguage } = require('./responseLanguage');
    const resolved = resolveResponseLanguage({ latestUserText: searchQuery, preference: 'auto' });
    const wikiLangMap = { ru: 'ru', uk: 'uk', en: 'en', de: 'de', fr: 'fr', es: 'es', pl: 'pl', it: 'it', pt: 'pt', ja: 'ja', zh: 'zh' };
    const language = wikiLangMap[resolved.code] || 'en';
    const wikiUrl = `https://${language}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}&gsrlimit=6&prop=extracts|info&exintro=1&explaintext=1&inprop=url&format=json&origin=*`;
    const wikiResponse = await fetch(wikiUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: resolveSearchSignal(signal),
    });
    if (!wikiResponse.ok) return [];
    const data = await wikiResponse.json();
    return Object.values(data.query?.pages || {})
        .sort((a, b) => (a.index || 0) - (b.index || 0))
        .map((page) => ({
            title: page.title,
            url: page.fullurl,
            excerpt: String(page.extract || '').slice(0, 900),
            domain: extractDomain(page.fullurl),
        }));
};

const logWebSearch = (message, details = {}) => {
    const safe = {};
    Object.entries(details).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (key === 'query' || key === 'original_question' || key === 'generated_query') {
            safe[key] = String(value).slice(0, 160);
            return;
        }
        safe[key] = value;
    });
    console.log(`[WEB_SEARCH] ${message}${Object.keys(safe).length ? ` ${JSON.stringify(safe)}` : ''}`);
};

const runSearchProviders = async (userQuestion, searchQueries, { days = null, topic = 'general', onPartial = null, signal = null } = {}) => {
    let rawSources = [];
    let provider = 'public';
    const intent = extractSearchIntent(userQuestion);
    const preferNews = topic === 'news' || intent.isNews === true;

    if (isTavilyConfigured()) {
        for (const candidateQuery of searchQueries) {
            const batch = await searchTavilySafe(candidateQuery, {
                days: days ?? (preferNews ? 7 : null),
                topic: preferNews ? 'news' : 'general',
                signal,
            });
            rawSources.push(...batch);
            if (batch.length) {
                onPartial?.(mapSourcesForClient(rankSources(userQuestion, rawSources, 4)));
            }
            if (rankSources(userQuestion, rawSources, 6).length >= 3) break;
        }
        if (rawSources.length) provider = 'tavily';
    }

    if (rankSources(userQuestion, rawSources, 3).length < 2) {
        for (const candidateQuery of searchQueries) {
            if (signal?.aborted) break;
            const bingResults = await searchBing(candidateQuery, { signal });
            rawSources.push(...bingResults);
            if (bingResults.length) {
                onPartial?.(mapSourcesForClient(rankSources(userQuestion, rawSources, 4)));
            }
            if (provider === 'public' && bingResults.length) provider = 'bing';
            if (rankSources(userQuestion, rawSources, 6).length >= 3) break;
        }
    }

    if (rankSources(userQuestion, rawSources, 3).length < 2) {
        for (const candidateQuery of searchQueries) {
            if (signal?.aborted) break;
            const ddgResults = await searchDuckDuckGo(candidateQuery, { signal });
            rawSources.push(...ddgResults);
            if (ddgResults.length) {
                onPartial?.(mapSourcesForClient(rankSources(userQuestion, rawSources, 4)));
            }
            if (ddgResults.length && provider === 'public') provider = 'duckduckgo';
            if (rankSources(userQuestion, rawSources, 6).length >= 3) break;
        }
    }

    const allowWikipedia = intent.isGeneralKnowledge || (!intent.isOperationalCurrent && !intent.isTravelRail);
    if (allowWikipedia && rankSources(userQuestion, rawSources, 2).length < 1) {
        try {
            if (!signal?.aborted) {
                const wikiQuery = searchQueries[0];
                const wikiResults = await searchWikipedia(wikiQuery, { signal });
                rawSources.push(...wikiResults);
                if (wikiResults.length && provider === 'public') provider = 'wikipedia';
            }
        } catch (wikiError) {
            logWebSearch('wikipedia skipped', { reason: wikiError.message });
        }
    }

    return { rawSources, provider };
};

const isPublicWebSearchAvailable = () => true;

const isWebSearchConfigured = () => isTavilyConfigured() || isPublicWebSearchAvailable();

const searchTavilySafe = async (searchQuery, { days = null, topic = 'general', signal = null } = {}) => {
    if (!isTavilyConfigured()) return [];
    try {
        const results = await searchTavily({
            query: searchQuery,
            maxResults: 8,
            searchDepth: 'basic',
            days,
            topic,
            signal,
        });
        logWebSearch('provider=tavily configured=true', { query: searchQuery, results: results.length, topic });
        return results;
    } catch (error) {
        logWebSearch('provider=tavily configured=true fallback=public', { reason: error.code || error.name || 'error' });
        return [];
    }
};

/**
 * @param {string} userQuestion
 * @param {(stage: string, extra?: object) => void} [onStatus]
 * @param {{ days?: number|null, topic?: string, language?: string, region?: string, signal?: AbortSignal, skipCache?: boolean }} [options]
 */
const collectWebSources = async (userQuestion, onStatus, options = {}) => {
    const {
        days = null,
        topic = 'general',
        language = null,
        region = null,
        signal = null,
        skipCache = false,
    } = options;
    const { cacheKey, getCached, setCached } = require('./webSearchCache');
    const bundle = buildIntentAwareSearchQueries(userQuestion);
    let searchQueries = bundle.queries.filter((q) => !isQueryDegenerate(q, bundle.intent));
    if (!searchQueries.length) searchQueries = [bundle.primary];
    if (language) {
        searchQueries = searchQueries.map((q) => `${q} ${String(language).slice(0, 16)}`.trim());
    }
    if (region) {
        searchQueries = searchQueries.map((q) => `${q} ${String(region).slice(0, 32)}`.trim());
    }
    const searchQuery = searchQueries[0];
    const retrievedAt = new Date().toISOString();
    const key = cacheKey({
        q: String(userQuestion || '').trim().slice(0, 400),
        days,
        topic,
        language,
        region,
    });

    if (!skipCache) {
        const cached = getCached(key);
        if (cached?.sources) {
            onStatus?.('searching', { query: searchQuery, cached: true });
            onStatus?.('found', {
                count: cached.sources.length,
                query: searchQuery,
                sources: mapSourcesForClient(cached.sources).slice(0, 4),
                cached: true,
            });
            if (cached.sources.length) {
                onStatus?.('checking', { count: cached.sources.length });
                onStatus?.('reading', { count: cached.sources.length });
            } else {
                onStatus?.('no_sources', { query: searchQuery });
            }
            return {
                ...cached,
                retrievedAt,
                fromCache: true,
            };
        }
    }

    logWebSearch('start', {
        original_question: userQuestion,
        generated_query: searchQuery,
        topic,
        days,
    });
    onStatus?.('searching', { query: searchQuery });

    let rawSources = [];
    let provider = 'public';
    let retried = false;
    let ranked = [];

    try {
        onStatus?.('finding_sources', { query: searchQuery });
        ({ rawSources, provider } = await runSearchProviders(userQuestion, searchQueries, {
            days,
            topic,
            signal,
            onPartial: (preview) => {
                onStatus?.('finding_sources', {
                    query: searchQuery,
                    count: preview.length,
                    sources: preview,
                });
            },
        }));
        ranked = rankSources(userQuestion, rawSources, 8);

        if (needsSearchRetry(ranked, bundle.intent) && bundle.retryQueries.length) {
            retried = true;
            logWebSearch('retry', { retry: true, generated_query: bundle.retryQueries[0] });
            const retryResult = await runSearchProviders(userQuestion, bundle.retryQueries, {
                days,
                topic,
                signal,
            });
            rawSources.push(...retryResult.rawSources);
            if (retryResult.provider !== 'public') provider = retryResult.provider;
            ranked = rankSources(userQuestion, rawSources, 8);
        }

        logWebSearch('completed', {
            provider,
            generated_query: searchQuery,
            result_count: rawSources.length,
            relevant_result_count: ranked.length,
            retry: retried,
            tavilyConfigured: isTavilyConfigured(),
        });
    } catch (error) {
        console.error('[WEB SEARCH]', error.message);
        throw error;
    }

    onStatus?.('found', {
        count: ranked.length,
        query: searchQuery,
        sources: mapSourcesForClient(ranked).slice(0, 6),
    });

    if (ranked.length) {
        onStatus?.('checking', { count: ranked.length });
        onStatus?.('reading', { count: ranked.length });
    } else {
        onStatus?.('no_sources', { query: searchQuery });
    }

    const payload = {
        searchQuery,
        sources: ranked,
        provider,
        webSearchAvailable: isWebSearchConfigured(),
        webSearchPerformed: true,
        webSearchComplete: ranked.length > 0,
        retrievedAt,
        fromCache: false,
    };
    setCached(key, payload);
    return payload;
};

const assignCitationIdsFromRanked = (sources) => sources.map((source, index) => ({
    ...source,
    citationId: source.citationId ?? source.rank ?? (index + 1),
    rank: source.citationId ?? source.rank ?? (index + 1),
}));

const { resolveResponseLanguage, buildLanguageInstructionBlock } = require('./responseLanguage');

const buildSynthesisPrompt = (userQuestion, sources) => {
    const resolved = resolveResponseLanguage({ latestUserText: userQuestion });
    const numbered = sources.length ? assignCitationIdsFromRanked(sources) : [];
    const sourceBlock = formatSourceContextForModel(numbered);
    const citationRules = buildCitationInstructions(numbered.length, resolved);

    return `You are answering a user using live web search results.

User question:
${userQuestion}

${citationRules}

Search results (evidence only — do NOT dump verbatim):
${sourceBlock}

Instructions:
- Answer the user's actual question directly in a natural, helpful tone.
- Do NOT paste raw search snippets or list URLs as the main answer.
- Ignore irrelevant or low-quality sources even if they appear in the list.
- Prefer official_operator, government_regulator, and international_public sourceTypes for policy and numeric claims.
- If reliable sources disagree, explain briefly.
- ${buildLanguageInstructionBlock(resolved)}
- Start with a concise direct answer, then add brief supporting context if helpful.
- Do not begin with "Web search completed" or similar meta commentary.`;
};

const resolveAiKey = () => getOpenRouterApiKey() || process.env.GEMINI_API_KEY?.trim();

const providerModels = {
    smart: 'google/gemini-2.5-flash',
    gpt: 'openai/gpt-4o-mini',
    claude: 'anthropic/claude-haiku-4.5',
    gemini: 'google/gemini-2.5-flash',
    deepseek: 'deepseek/deepseek-flash',
    perplexity: 'perplexity/sonar',
};

const geminiModelName = () => process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const buildKnowledgeOnlyPrompt = (userQuestion) => {
    const resolved = resolveResponseLanguage({ latestUserText: userQuestion });
    return `Answer this question directly using your general knowledge.

Question: ${userQuestion}

Instructions:
- Give a clear, helpful, accurate answer.
- If web sources were unavailable or irrelevant, do not mention technical failures.
- ${buildLanguageInstructionBlock(resolved)}
- For coding or framework questions, name concrete options with brief pros/cons.
- Do not dump raw search results or URLs.`;
};

const parseStreamChunk = (payload, useGeminiDirect) => {
    if (useGeminiDirect) {
        return payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    }
    return payload.choices?.[0]?.delta?.content || '';
};

const consumeSseStream = async (apiResponse, res, useGeminiDirect) => {
    const reader = apiResponse.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantText = '';

    while (reader) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.replaceAll('\r\n', '\n').split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
            const dataLine = event.split('\n').find((line) => line.startsWith('data: '));
            if (!dataLine) continue;
            const payload = dataLine.slice(6).trim();
            if (!payload || payload === '[DONE]') continue;
            let chunk;
            try {
                chunk = JSON.parse(payload);
            } catch {
                continue;
            }
            const text = parseStreamChunk(chunk, useGeminiDirect);
            if (text) {
                assistantText += text;
                if (res) res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
        }
        if (done) break;
    }

    return assistantText;
};

const requestOpenRouterStream = async (prompt, modelSlug, timeoutMs) => {
    const gatewayKey = getOpenRouterApiKey();
    if (!gatewayKey?.trim()) return null;
    const gatewayModel = providerModels[modelSlug] || providerModels.gemini;
    return fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
            Authorization: `Bearer ${gatewayKey.trim()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: gatewayModel,
            stream: true,
            max_tokens: 2048,
            messages: [
                { role: 'system', content: 'You synthesize web search results into accurate, cited answers.' },
                { role: 'user', content: prompt },
            ],
        }),
    });
};

const requestGeminiStream = async (prompt, timeoutMs) => {
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (!geminiKey) return null;
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModelName()}:streamGenerateContent?alt=sse&key=${encodeURIComponent(geminiKey)}`;
    return fetch(geminiUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 2048 },
        }),
    });
};

const streamAiAnswer = async (res, {
    userQuestion,
    sources,
    modelSlug = 'gemini',
    onStatus,
    allowKnowledgeFallback = true,
    customPrompt = null,
}) => {
    onStatus?.('analyzing');

    if (!resolveAiKey()) {
        throw new Error('AI provider is not configured on the server.');
    }

    const normalizedModel = modelSlug === 'smart' ? 'gemini' : modelSlug;
    const synthesisPrompt = customPrompt || (sources.length
        ? buildSynthesisPrompt(userQuestion, sources)
        : buildKnowledgeOnlyPrompt(userQuestion));
    const timeoutMs = Math.min(Math.max(Number(process.env.AI_REQUEST_TIMEOUT_MS) || 45000, 5000), 120000);

    const trySynthesize = async (prompt) => {
        let lastError = null;

        try {
            const openRouter = await requestOpenRouterStream(prompt, normalizedModel, timeoutMs);
            if (openRouter?.ok) {
                const text = await consumeSseStream(openRouter, res, false);
                if (text.trim()) return text;
            } else if (openRouter) {
                const errBody = await openRouter.json().catch(() => ({}));
                lastError = new Error(errBody.error?.message || 'OpenRouter synthesis failed');
            }
        } catch (error) {
            lastError = error;
            console.error('[WEB SEARCH SYNTHESIS]', error.message);
        }

        try {
            const gemini = await requestGeminiStream(prompt, timeoutMs);
            if (gemini?.ok) {
                const text = await consumeSseStream(gemini, res, true);
                if (text.trim()) return text;
            } else if (gemini) {
                const errBody = await gemini.json().catch(() => ({}));
                lastError = new Error(errBody.error?.message || 'Gemini synthesis failed');
            }
        } catch (error) {
            lastError = error;
            console.error('[WEB SEARCH SYNTHESIS]', error.message);
        }

        if (lastError) throw lastError;
        return '';
    };

    let text = await trySynthesize(synthesisPrompt);
    if (!text.trim() && allowKnowledgeFallback) {
        onStatus?.('analyzing');
        text = await trySynthesize(buildKnowledgeOnlyPrompt(userQuestion));
    }

    if (!text.trim()) {
        throw new Error('AI synthesis returned no text');
    }

    return text;
};

const writeSse = (res, payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

module.exports = {
    needsCurrentInformation,
    buildSearchQuery,
    buildAlternateSearchQueries,
    buildIntentAwareSearchQueries,
    extractSearchIntent,
    collectWebSources,
    runSearchProviders,
    rankSources,
    buildSynthesisPrompt,
    mapSourcesForClient,
    formatSourceContextForModel,
    streamAiAnswer,
    writeSse,
    resolveAiKey,
    extractDomain,
    isWebSearchConfigured,
    isTavilyConfigured,
    searchBing,
    searchDuckDuckGo,
    searchWikipedia,
};
