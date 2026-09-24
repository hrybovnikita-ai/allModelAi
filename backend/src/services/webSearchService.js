/**
 * Web search collection, ranking, and AI synthesis for AllModelAI.
 * Search uses public Bing RSS, DuckDuckGo HTML, and Wikipedia — no frontend API keys.
 */

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

const meaningfulTokens = (text) => tokenize(text).filter((token) => !STOP_WORDS.has(token));

const detectQueryIntent = (text) => {
    const lower = String(text || '').toLowerCase();
    return {
        isPythonWebFrameworks: /python/i.test(lower) && /framework|library|django|flask|fastapi|starlette|tornado|pyramid|bottle|web\s+(dev|app|development|framework)/i.test(lower),
        isCoding: /python|javascript|typescript|react|node|django|flask|fastapi|framework|library|api|backend|frontend|programming|code|developer/i.test(lower),
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
    const text = String(prompt || '').toLowerCase();
    return /research|latest|source|news|find|citation|исслед|источник|новост|найди|price|pricing|cost|how much|today|weather|current|release date|available now|сколько|цена|стоим|погод|сегодня|актуал|сейчас|курс|exchange rate|stock|последн|новин/i.test(text);
};

const buildSearchQuery = (userQuestion) => {
    let query = String(userQuestion || '').trim();
    const lower = query.toLowerCase();

    query = query
        .replace(/^(please|can you|could you|tell me|find me|search for|look up|show me|what is|what's|how much is|how much does|скажи|найди|покажи|сколько стоит)\s+/i, '')
        .replace(/[?!.]+$/g, '')
        .trim();

    const isPriceQuery = /price|pricing|cost|how much|сколько|стоим|цена|usd|\$/i.test(lower);
    const iphoneMatch = lower.match(/iphone\s*(\d+\s*)?(pro\s*)?(max|plus|mini)?/i);
    if (iphoneMatch || /айфон/i.test(lower)) {
        const modelParts = [];
        if (/18|19|17|16|15/i.test(lower)) {
            const gen = lower.match(/iphone\s*(\d+)/i)?.[1] || lower.match(/(\d+)\s*pro/i)?.[1];
            if (gen) modelParts.push(`iPhone ${gen}`);
        }
        if (/pro\s*max/i.test(lower)) modelParts.push('Pro Max');
        else if (/pro/i.test(lower)) modelParts.push('Pro');
        else if (/plus/i.test(lower)) modelParts.push('Plus');
        else if (/mini/i.test(lower)) modelParts.push('mini');

        const modelName = modelParts.length ? modelParts.join(' ') : 'iPhone';
        if (isPriceQuery) {
            return `${modelName} official price USD United States Apple store ${new Date().getFullYear()}`;
        }
        return `${modelName} Apple official specifications ${new Date().getFullYear()}`;
    }

    if (isPriceQuery && !/\b(usd|dollar|\$|price|pricing)\b/i.test(query)) {
        query = `${query} price USD`;
    }

    if (/weather|погод/i.test(lower) && !/today|forecast|сегодня/i.test(lower)) {
        query = `${query} weather forecast today`;
    }

    if (/latest|recent|today|current|сегодня|последн|актуал/i.test(lower) && !/news|новост/i.test(lower)) {
        query = `${query} latest news ${new Date().getFullYear()}`;
    }

    const intent = detectQueryIntent(userQuestion);
    const year = new Date().getFullYear();

    if (intent.isPythonWebFrameworks) {
        return `best Python web application frameworks Django Flask FastAPI comparison ${year}`;
    }

    if (intent.isCoding) {
        query = query
            .replace(/\bweb\b/gi, 'web development')
            .replace(/\bframeworks?\b/gi, 'software framework')
            .replace(/\bthe\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (intent.languages.python) {
            return `${query} Python programming ${year}`.slice(0, 280);
        }
        return `${query} programming developer guide ${year}`.slice(0, 280);
    }

    return query.slice(0, 280);
};

const buildAlternateSearchQueries = (userQuestion) => {
    const primary = buildSearchQuery(userQuestion);
    const intent = detectQueryIntent(userQuestion);
    const alternates = [];

    if (intent.isPythonWebFrameworks) {
        alternates.push('Django vs Flask vs FastAPI Python web framework');
        alternates.push('top Python backend web frameworks developer survey');
    } else if (intent.isCoding && intent.languages.python) {
        alternates.push(`${meaningfulTokens(userQuestion).slice(0, 6).join(' ')} Python tutorial`);
    }

    return [...new Set([primary, ...alternates])].slice(0, 3);
};

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
    const queryTokens = meaningfulTokens(userQuestion);
    const blob = `${source.title} ${source.excerpt} ${source.domain}`.toLowerCase();
    let score = Math.max(0, 30 - rankIndex * 2);

    if (isOffTopicSource(userQuestion, source)) {
        return -100;
    }

    queryTokens.forEach((token) => {
        if (blob.includes(token)) score += token.length > 5 ? 12 : 8;
    });

    const domain = source.domain || extractDomain(source.url);
    [...AUTHORITY_BONUS, ...TECH_AUTHORITY_BONUS].forEach((entry) => {
        const pattern = entry.pattern || entry;
        const bonus = entry.bonus || 18;
        if (pattern.test(domain) || pattern.test(source.url)) score += bonus;
    });

    if (LOW_QUALITY_PATTERNS.some((pattern) => pattern.test(source.url) || pattern.test(source.title) || pattern.test(source.domain))) {
        score -= 50;
    }

    if (/youtube\.com|youtu\.be/i.test(source.url) && !/video|review|hands.?on|tutorial|обзор/i.test(userQuestion)) {
        score -= 15;
    }

    const matchedTopicTokens = queryTokens.filter((token) => blob.includes(token)).length;
    if (queryTokens.length >= 2 && matchedTopicTokens < 2) {
        score -= 25;
    }

    if (source.excerpt && source.excerpt.length < 40) score -= 5;
    if (source.excerpt && source.excerpt.length > 80) score += 4;

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

const rankSources = (userQuestion, sources, limit = 6) => dedupeSources(sources)
    .map((source, index) => ({ ...source, score: scoreSource(userQuestion, source, index) }))
    .filter((source) => source.score > 10 && source.title && source.url)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((source, index) => ({
        ...source,
        rank: index + 1,
        excerpt: String(source.excerpt || '').slice(0, 320),
    }));

const searchBing = async (searchQuery) => {
    const response = await fetch(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(searchQuery)}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 10).map((match) => {
        const item = match[1];
        const value = (tag) => decodeHtml(item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') || '');
        const url = value('link');
        return {
            title: value('title'),
            url,
            excerpt: value('description').slice(0, 700),
            domain: extractDomain(url),
        };
    }).filter((source) => source.title && /^https?:\/\//.test(source.url));
};

const searchDuckDuckGo = async (searchQuery) => {
    const response = await fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({ q: searchQuery }).toString(),
        signal: AbortSignal.timeout(12000),
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

const searchWikipedia = async (searchQuery) => {
    const language = /[а-яіїєґ]/i.test(searchQuery) ? 'uk' : 'en';
    const wikiUrl = `https://${language}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}&gsrlimit=6&prop=extracts|info&exintro=1&explaintext=1&inprop=url&format=json&origin=*`;
    const wikiResponse = await fetch(wikiUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(12000),
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

const collectWebSources = async (userQuestion, onStatus) => {
    const searchQueries = buildAlternateSearchQueries(userQuestion);
    const searchQuery = searchQueries[0];
    onStatus?.('searching', { query: searchQuery });

    let rawSources = [];
    try {
        for (const candidateQuery of searchQueries) {
            const bingResults = await searchBing(candidateQuery);
            rawSources.push(...bingResults);
            if (rankSources(userQuestion, rawSources, 6).length >= 3) break;
        }

        if (rankSources(userQuestion, rawSources, 3).length < 2) {
            for (const candidateQuery of searchQueries) {
                rawSources.push(...await searchDuckDuckGo(candidateQuery));
                if (rankSources(userQuestion, rawSources, 6).length >= 3) break;
            }
        }

        if (rankSources(userQuestion, rawSources, 2).length < 1) {
            rawSources.push(...await searchWikipedia(searchQuery));
        }
    } catch (error) {
        console.error('[WEB SEARCH]', error.message);
        throw error;
    }

    let ranked = rankSources(userQuestion, rawSources, 8);

    if (!ranked.length && rawSources.length) {
        ranked = dedupeSources(rawSources)
            .slice(0, 4)
            .map((source, index) => ({
                ...source,
                rank: index + 1,
                excerpt: String(source.excerpt || '').slice(0, 320),
            }));
    }

    onStatus?.('found', { count: ranked.length, query: searchQuery });

    if (ranked.length) {
        onStatus?.('reading', { count: ranked.length });
    }

    return { searchQuery, sources: ranked };
};

const buildSynthesisPrompt = (userQuestion, sources) => {
    const sourceBlock = sources.length
        ? sources.map((source) => `[${source.rank}] ${source.title}\nDomain: ${source.domain}\nURL: ${source.url}\nExcerpt: ${source.excerpt}`).join('\n\n')
        : 'No web sources were retrieved.';

    return `You are answering a user using live web search results.

User question:
${userQuestion}

Search results (use as evidence only — do NOT dump them verbatim):
${sourceBlock}

Instructions:
- Answer the user's actual question directly in a natural, helpful tone.
- Do NOT paste raw search snippets or list URLs as the main answer.
- Ignore irrelevant or low-quality sources.
- Prefer authoritative and recent sources when they agree.
- If reliable sources disagree, explain the disagreement briefly.
- If the requested information is not confirmed in the sources, say clearly that it is not confirmed — do not invent facts.
- Cite sources inline using [1], [2], etc. matching the numbered search results above when making factual claims.
- Reply in the same language as the user's question (English → English, Russian → Russian, Ukrainian → Ukrainian).
- Start with a concise direct answer, then add brief supporting context if helpful.
- Do not begin with "Web search completed" or similar meta commentary.`;
};

const resolveAiKey = () => process.env.OPENROUTER_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY;

const providerModels = {
    smart: 'google/gemini-2.5-flash',
    gpt: 'openai/gpt-4o-mini',
    claude: 'anthropic/claude-haiku-4.5',
    gemini: 'google/gemini-2.5-flash',
    deepseek: 'deepseek/deepseek-chat',
    perplexity: 'perplexity/sonar',
};

const geminiModelName = () => process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const buildKnowledgeOnlyPrompt = (userQuestion) => `Answer this question directly using your general knowledge.

Question: ${userQuestion}

Instructions:
- Give a clear, helpful, accurate answer.
- If web sources were unavailable or irrelevant, do not mention technical failures.
- Reply in the same language as the question.
- For coding or framework questions, name concrete options with brief pros/cons.
- Do not dump raw search results or URLs.`;

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
    const gatewayKey = process.env.OPENROUTER_API_KEY || process.env.API_KEY;
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

const streamAiAnswer = async (res, { userQuestion, sources, modelSlug = 'gemini', onStatus, allowKnowledgeFallback = true }) => {
    onStatus?.('analyzing');

    if (!resolveAiKey()) {
        throw new Error('AI provider is not configured on the server.');
    }

    const normalizedModel = modelSlug === 'smart' ? 'gemini' : modelSlug;
    const synthesisPrompt = sources.length
        ? buildSynthesisPrompt(userQuestion, sources)
        : buildKnowledgeOnlyPrompt(userQuestion);
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
    collectWebSources,
    rankSources,
    buildSynthesisPrompt,
    streamAiAnswer,
    writeSse,
    resolveAiKey,
    extractDomain,
    searchBing,
    searchDuckDuckGo,
    searchWikipedia,
};
