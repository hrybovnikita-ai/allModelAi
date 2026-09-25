/**
 * Multi-step Deep Research pipeline (Tavily + existing AllModelAI LLM).
 */

const { TavilyError, searchTavily } = require('./tavilyClient');
const webSearchService = require('./webSearchService');

const DEPTH_PROFILES = {
    quick: {
        label: 'Quick',
        maxSearchCalls: 2,
        maxResultsPerSearch: 5,
        searchDepth: 'basic',
        planQueries: 2,
        advancedCalls: 0,
        maxSources: 8,
    },
    deep: {
        label: 'Deep',
        maxSearchCalls: 4,
        maxResultsPerSearch: 6,
        searchDepth: 'basic',
        planQueries: 4,
        advancedCalls: 0,
        maxSources: 14,
    },
    maximum: {
        label: 'Maximum',
        maxSearchCalls: 6,
        maxResultsPerSearch: 8,
        searchDepth: 'basic',
        planQueries: 5,
        advancedCalls: 2,
        maxSources: 20,
    },
};

const TIME_RANGE_DAYS = {
    day: 1,
    week: 7,
    month: 30,
    year: 365,
};

const PUBLIC_STAGES = {
    planning: 'Planning research...',
    searching: 'Searching the web...',
    reading: 'Reading sources...',
    cross_check: 'Cross-checking information...',
    analyzing: 'Analyzing evidence...',
    writing: 'Writing research report...',
};

const normalizeDepth = (value) => {
    const key = String(value || 'deep').toLowerCase().trim();
    if (key === 'quick' || key === 'fast') return 'quick';
    if (key === 'maximum' || key === 'max') return 'maximum';
    return 'deep';
};

const normalizeTimeRange = (value) => {
    const key = String(value || '').toLowerCase().trim();
    if (['day', 'week', 'month', 'year'].includes(key)) return key;
    return null;
};

const dedupeByUrl = (sources) => {
    const map = new Map();
    sources.forEach((source) => {
        const url = String(source.url || '').split('#')[0];
        if (!url) return;
        const existing = map.get(url);
        if (!existing || (source.score || 0) > (existing.score || 0)) {
            map.set(url, { ...source, url });
        }
    });
    return [...map.values()];
};

const fallbackQueries = (query, count) => {
    const base = String(query).trim();
    const candidates = [
        base,
        `${base} official documentation`,
        `${base} primary sources evidence`,
        `${base} recent developments`,
        `${base} limitations criticism`,
    ];
    return [...new Set(candidates.map((q) => q.slice(0, 280)))].slice(0, count);
};

const resolveLlmKey = () => webSearchService.resolveAiKey();

const completeLlmJson = async (prompt) => {
    const timeoutMs = 45000;
    const gatewayKey = process.env.OPENROUTER_API_KEY || process.env.API_KEY;
    if (gatewayKey?.trim()) {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(timeoutMs),
            headers: {
                Authorization: `Bearer ${gatewayKey.trim()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                max_tokens: 800,
                temperature: 0.2,
                messages: [
                    { role: 'system', content: 'Return valid JSON only. No markdown fences.' },
                    { role: 'user', content: prompt },
                ],
            }),
        });
        if (response.ok) {
            const data = await response.json();
            const text = data.choices?.[0]?.message?.content || '';
            const match = text.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
        }
    }

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey) {
        const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`;
        const response = await fetch(url, {
            method: 'POST',
            signal: AbortSignal.timeout(timeoutMs),
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: 800, temperature: 0.2 },
            }),
        });
        if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
            const match = text.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
        }
    }

    return null;
};

const planResearch = async (userQuestion, profile) => {
    const prompt = `You are a research planner. The user question:
"${userQuestion.slice(0, 500)}"

Return JSON:
{
  "objective": "one sentence research goal",
  "queries": ["search query 1", "search query 2"]
}

Rules:
- Produce exactly ${profile.planQueries} diverse, precise search queries.
- Prioritize official docs, primary sources, government/academic, then authoritative publishers.
- No duplicate queries.
- English queries unless the user question is clearly Russian/Ukrarian (then match user language).`;

    try {
        const parsed = await completeLlmJson(prompt);
        const queries = Array.isArray(parsed?.queries)
            ? parsed.queries.map((q) => String(q).trim()).filter(Boolean)
            : [];
        if (queries.length >= 1) {
            return {
                objective: String(parsed.objective || userQuestion).slice(0, 400),
                queries: [...new Set(queries)].slice(0, profile.planQueries),
            };
        }
    } catch (error) {
        console.error('[DEEP RESEARCH] plan failed:', error.message);
    }

    return {
        objective: userQuestion.slice(0, 400),
        queries: fallbackQueries(userQuestion, profile.planQueries),
    };
};

const runTavilySearches = async (queries, profile, days) => {
    const collected = [];
    let calls = 0;
    for (let i = 0; i < queries.length && calls < profile.maxSearchCalls; i += 1) {
        const useAdvanced = profile.advancedCalls > 0 && i >= queries.length - profile.advancedCalls;
        const searchDepth = useAdvanced ? 'advanced' : profile.searchDepth;
        // eslint-disable-next-line no-await-in-loop
        const batch = await searchTavily({
            query: queries[i],
            searchDepth,
            maxResults: profile.maxResultsPerSearch,
            days,
        });
        collected.push(...batch);
        calls += 1;
    }
    return collected;
};

const buildReportPrompt = (userQuestion, objective, sources, crossCheckNotes) => {
    const sourceBlock = sources.map((source) => (
        `[${source.rank}] ${source.title}\nDomain: ${source.domain}\nURL: ${source.url}\nPublished: ${source.publishedDate || 'unknown'}\nExcerpt: ${source.excerpt}`
    )).join('\n\n');

    return `You are writing a professional Deep Research report for AllModelAI.

User question:
${userQuestion}

Research objective:
${objective}

Cross-check notes:
${crossCheckNotes || 'No major contradictions flagged automatically.'}

Evidence (ONLY use these sources — never invent URLs or citations):
${sourceBlock || 'No sources were retrieved.'}

Write a structured report in Markdown with these sections (use ## headings):

## Deep Research

## Overview

## Key findings

## Detailed analysis

## Comparison
(Include only when multiple perspectives exist; otherwise write "Not applicable.")

## Limitations / uncertainty

## Conclusion

## Sources
(List as [n] Title — domain with real URLs from evidence only)

Rules:
- Cite factual claims inline as [1], [2] matching source ranks.
- Never fabricate sources, quotes, or statistics.
- If sources conflict, explain in Comparison and Limitations.
- If evidence is insufficient, state that clearly.
- Reply in the same language as the user question.
- Do not expose chain-of-thought or internal planning.`;
};

const crossCheckSources = async (userQuestion, sources) => {
    if (!sources.length || !resolveLlmKey()) {
        return 'Cross-check skipped (no sources or LLM unavailable).';
    }
    const brief = sources.slice(0, 10).map((s) => `[${s.rank}] ${s.title}: ${s.excerpt.slice(0, 200)}`).join('\n');
    const prompt = `Review these excerpts for the question "${userQuestion.slice(0, 200)}".
List contradictions, weak claims, or missing primary evidence in 3-6 bullet points. If none, say "No major contradictions detected."

Sources:
${brief}`;

    try {
        const parsed = await completeLlmJson(`${prompt}\n\nReturn JSON only: {"notes":"bullet points"}`);
        if (parsed?.notes) return String(parsed.notes).slice(0, 1500);
    } catch {
        /* fall through */
    }
    return 'Automated cross-check completed.';
};

const emitStage = (res, stage, extra = {}) => {
    webSearchService.writeSse(res, {
        deepResearch: true,
        deepResearchStage: stage,
        deepResearchLabel: PUBLIC_STAGES[stage] || stage,
        webSearchStatus: stage,
        ...extra,
    });
};

const mapSourcesForClient = (sources) => sources.map(({ rank, title, url, domain, excerpt, publishedDate }) => ({
    rank,
    title,
    url,
    domain,
    excerpt: String(excerpt || '').slice(0, 280),
    publishedDate: publishedDate || null,
}));

const runDeepResearch = async (res, { query, modelSlug = 'gemini', depth, timeRange }) => {
    const profile = DEPTH_PROFILES[normalizeDepth(depth)];
    const days = TIME_RANGE_DAYS[normalizeTimeRange(timeRange)] || null;

    emitStage(res, 'planning');
    const plan = await planResearch(query, profile);

    emitStage(res, 'searching', { queryCount: plan.queries.length });
    let rawSources = await runTavilySearches(plan.queries, profile, days);

    emitStage(res, 'reading', { count: rawSources.length });
    let ranked = webSearchService.rankSources(query, rawSources, profile.maxSources);
    ranked = dedupeByUrl(ranked).slice(0, profile.maxSources);

    if (!ranked.length) {
        webSearchService.writeSse(res, {
            deepResearch: true,
            error: 'no_sources',
            message: 'No reliable sources were found for this question. Try rephrasing or a broader time range.',
        });
        webSearchService.writeSse(res, { webSources: [], webSearchComplete: false });
        res.write('data: [DONE]\n\n');
        return res.end();
    }

    emitStage(res, 'cross_check');
    const crossCheckNotes = await crossCheckSources(query, ranked);

    emitStage(res, 'analyzing');
    const reportPrompt = buildReportPrompt(query, plan.objective, ranked, crossCheckNotes);

    emitStage(res, 'writing');
    let assistantText = '';
    try {
        assistantText = await webSearchService.streamAiAnswer(res, {
            userQuestion: query,
            sources: ranked,
            modelSlug,
            onStatus: () => {},
            allowKnowledgeFallback: false,
            customPrompt: reportPrompt,
        });
    } catch (error) {
        console.error('[DEEP RESEARCH] synthesis failed:', error.message);
        const synthError = new Error('Could not generate the research report. Try again or use Quick depth.');
        synthError.code = 'llm_synthesis';
        throw synthError;
    }

    webSearchService.writeSse(res, {
        webSources: mapSourcesForClient(ranked),
        webSearchComplete: Boolean(assistantText),
        deepResearch: true,
        researchDepth: normalizeDepth(depth),
        searchQueries: plan.queries,
    });
    res.write('data: [DONE]\n\n');
    return res.end();
};

const collectDeepResearch = async ({ query, depth, timeRange }) => {
    const profile = DEPTH_PROFILES[normalizeDepth(depth)];
    const days = TIME_RANGE_DAYS[normalizeTimeRange(timeRange)] || null;
    const plan = await planResearch(query, profile);
    const rawSources = await runTavilySearches(plan.queries, profile, days);
    const ranked = dedupeByUrl(webSearchService.rankSources(query, rawSources, profile.maxSources));
    return {
        query,
        objective: plan.objective,
        depth: normalizeDepth(depth),
        searchQueries: plan.queries,
        sources: mapSourcesForClient(ranked),
    };
};

const mapErrorToResponse = (error) => {
    if (error instanceof TavilyError) {
        return { status: error.status, body: { code: error.code, message: error.message } };
    }
    if (error.code === 'llm_synthesis') {
        return { status: 502, body: { code: error.code, message: error.message } };
    }
    return { status: 502, body: { code: 'research_failed', message: 'Deep Research failed. Please try again.' } };
};

module.exports = {
    DEPTH_PROFILES,
    PUBLIC_STAGES,
    normalizeDepth,
    normalizeTimeRange,
    planResearch,
    dedupeByUrl,
    runDeepResearch,
    collectDeepResearch,
    mapErrorToResponse,
    TavilyError,
};
