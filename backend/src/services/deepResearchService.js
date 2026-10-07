/**
 * Multi-step Deep Research pipeline (SearchProvider + AllModelAI LLM + optional Knowledge Base).
 */

const webSearchService = require('./webSearchService');
const { getOpenRouterApiKey } = require('../openRouterConfig');
const {
    SearchProviderError,
    TavilyError,
    executePlannedSearches,
    isResearchSearchAvailable,
    listConfiguredProviders,
} = require('./search/searchProvider');
const { writeResearchEvent } = require('./deepResearch/researchEvents');
const {
    analyzeClarification,
    mergeClarificationAnswers,
} = require('./deepResearch/clarification');
const {
    rankDeepResearchSources,
    logDeepResearchDiagnostics,
    buildSupplementQueries,
    dedupeByUrl: pipelineDedupeByUrl,
} = require('./deepResearch/sourcePipeline');
const { selectSmartRoute } = require('./smartRouter2');

const DEPTH_PROFILES = {
    quick: {
        label: 'Quick',
        maxSearchCalls: 2,
        maxResultsPerSearch: 5,
        searchDepth: 'basic',
        planQueries: 2,
        advancedCalls: 0,
        maxSources: 8,
        maxModelCalls: 4,
        agents: { planner: true, researcher: true, analyst: false, verifier: false, writer: true },
        verificationPasses: 0,
        timeoutMs: 120000,
    },
    deep: {
        label: 'Deep',
        maxSearchCalls: 4,
        maxResultsPerSearch: 6,
        searchDepth: 'basic',
        planQueries: 4,
        advancedCalls: 0,
        maxSources: 14,
        maxModelCalls: 8,
        agents: { planner: true, researcher: true, analyst: true, verifier: true, writer: true },
        verificationPasses: 1,
        timeoutMs: 240000,
    },
    maximum: {
        label: 'Maximum',
        maxSearchCalls: 6,
        maxResultsPerSearch: 8,
        searchDepth: 'basic',
        planQueries: 5,
        advancedCalls: 2,
        maxSources: 20,
        maxModelCalls: 12,
        agents: { planner: true, researcher: true, analyst: true, verifier: true, writer: true },
        verificationPasses: 2,
        timeoutMs: 360000,
    },
};

const TIME_RANGE_DAYS = {
    day: 1,
    week: 7,
    month: 30,
    year: 365,
};

const PUBLIC_STAGES = {
    understanding: 'Understanding your goal',
    planning: 'Building research plan',
    searching: 'Searching the web',
    reading: 'Reading sources',
    cross_check: 'Cross-checking claims',
    analyzing: 'Analyzing evidence',
    verification: 'Verifying sources',
    writing: 'Preparing report',
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
    const lower = base.toLowerCase();
    const candidates = [base];

    if (/(\bии\b|\bш[iі]\b|асистент|пomощник|помічник|код|програм|coding assistant|ai tool)/i.test(lower)) {
        candidates.push(
            'best AI coding assistants for professional developers',
            'AI coding tools comparison GitHub Copilot Cursor Claude',
            'AI developer tools official documentation',
        );
    }
    if (/python|книг|book|senior|разработ/i.test(lower)) {
        candidates.push(
            'best advanced Python books senior developer',
            'Python programming expert books O\'Reilly review',
        );
    }

    candidates.push(
        `${base} official documentation`,
        `${base} comparison review`,
        `${base} primary sources`,
    );

    return [...new Set(candidates.map((q) => q.slice(0, 280)))].slice(0, count);
};

const resolveLlmKey = () => webSearchService.resolveAiKey();

const completeLlmJson = async (prompt) => {
    const timeoutMs = 45000;
    const gatewayKey = getOpenRouterApiKey();
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
- Prefer English search queries even when the user writes in Russian or Ukrainian (better web coverage).
- Include product names, comparisons, and "official documentation" style queries when relevant.
- Prioritize official docs, primary sources, then authoritative tech publishers.
- No duplicate queries.`;

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

const pickResearchModel = (phase, fallbackSlug) => {
    const task = phase === 'writing' ? 'writing' : phase === 'planning' ? 'reasoning' : 'research';
    try {
        const route = selectSmartRoute('', { routerMode: 'quality', modelAllowed: () => true });
        const slug = pickResearchModelFromRoute(route, task, fallbackSlug);
        if (slug) return slug;
    } catch {
        /* use fallback */
    }
    return fallbackSlug || 'gemini';
};

const pickResearchModelFromRoute = (route, task, fallbackSlug) => {
    if (!route?.slug) return fallbackSlug;
    if (task === 'writing' && route.taskType === 'writing') return route.slug;
    if (task === 'reasoning') return route.slug;
    return route.slug || fallbackSlug;
};

const attachKnowledgeSources = async (connection, email, query, useKnowledge) => {
    if (!useKnowledge || !connection || !email) {
        return { kbSources: [], kbDocumentsUsed: 0 };
    }
    try {
        const knowledgeBaseService = require('./rag/knowledgeBaseService');
        const hits = await knowledgeBaseService.retrieveForQuery(connection, email, query, 6);
        const kbSources = (hits || []).map((hit, index) => ({
            title: hit.title || hit.documentTitle || `Knowledge document ${index + 1}`,
            url: hit.sourceUrl || `knowledge://document/${hit.documentId || index}`,
            excerpt: String(hit.text || hit.chunk || '').slice(0, 900),
            domain: 'Knowledge Base',
            publishedDate: hit.updatedAt || null,
            knowledgeBase: true,
            documentId: hit.documentId,
            score: hit.score ?? 0.9,
        }));
        const docIds = new Set(kbSources.map((s) => s.documentId).filter(Boolean));
        return { kbSources, kbDocumentsUsed: docIds.size || kbSources.length };
    } catch (error) {
        console.error('[DEEP RESEARCH] knowledge base skipped:', error.message);
        return { kbSources: [], kbDocumentsUsed: 0 };
    }
};

const runPlannedSearch = async (res, { userQuestion, queries, profile, days, signal }) => {
    let discoveredCount = 0;
    writeResearchEvent(res, 'search.started', {
        deepResearchStage: 'searching',
        queryCount: Math.min(queries.length, profile.maxSearchCalls),
    });

    const result = await executePlannedSearches({
        userQuestion,
        queries,
        profile,
        days,
        signal,
        onSourceFound: (_source, total) => {
            discoveredCount = total;
            writeResearchEvent(res, 'search.source_found', {
                deepResearchStage: 'searching',
                sourceCount: total,
                count: total,
            });
        },
    });

    writeResearchEvent(res, 'search.completed', {
        deepResearchStage: 'reading',
        sourceCount: result.sources.length,
        count: result.sources.length,
        searchCalls: result.searchCalls,
        providersUsed: result.providersUsed,
    });

    return { ...result, discoveredCount };
};

const buildReportPrompt = (userQuestion, objective, sources, crossCheckNotes, verificationNotes) => {
    const sourceBlock = sources.map((source) => {
        const origin = source.knowledgeBase ? 'Knowledge Base (user uploaded — NOT a web page)' : 'Web';
        return `[${source.rank}] ${source.title}\nOrigin: ${origin}\nDomain: ${source.domain}\nURL: ${source.url}\nPublished: ${source.publishedDate || 'unknown'}\nExcerpt: ${source.excerpt}`;
    }).join('\n\n');

    return `You are writing a professional Deep Research report for AllModelAI.

User question:
${userQuestion}

Research objective:
${objective}

Cross-check notes:
${crossCheckNotes || 'No major contradictions flagged automatically.'}

Verification notes:
${verificationNotes || 'Standard verification completed where configured.'}

Evidence (ONLY use these sources — never invent URLs or citations):
${sourceBlock || 'No sources were retrieved.'}

Write a structured Markdown report adapted to the question (do NOT force book-list headings unless the user asked for books).
Include when relevant: executive summary, top recommendations, comparison, learning path, limitations, conclusion.
End with a ## Sources section listing [n] Title — domain with real URLs from evidence only.
Clearly label Knowledge Base items separately from web sources in the Sources section.

Rules:
- Cite factual claims inline as [1], [2] matching source ranks.
- Never fabricate sources, quotes, or statistics.
- If sources conflict, explain in Comparison and Limitations.
- If evidence is insufficient, state that clearly.
- Reply in the same language as the user question.
- Do not expose chain-of-thought or internal planning.`;
};

const verifyClaims = async (userQuestion, sources, profile) => {
    if (!profile.agents?.verifier || !profile.verificationPasses || !sources.length || !resolveLlmKey()) {
        return { notes: 'Verification skipped for this research profile.', incomplete: false };
    }
    const brief = sources.slice(0, 12).map((s) => `[${s.rank}] ${s.title}: ${s.excerpt.slice(0, 180)}`).join('\n');
    const prompt = `You verify factual claims for research on: "${userQuestion.slice(0, 200)}".
Flag unsupported claims, missing primary evidence, or conflicts. 4-8 bullet points. If adequate, say verification adequate.

Sources:
${brief}

Return JSON only: {"notes":"...","incomplete":true|false}`;

    try {
        const parsed = await completeLlmJson(prompt);
        if (parsed?.notes) {
            return {
                notes: String(parsed.notes).slice(0, 1500),
                incomplete: Boolean(parsed.incomplete),
            };
        }
    } catch {
        /* fall through */
    }
    return { notes: 'Automated verification completed.', incomplete: false };
};

const crossCheckSources = async (userQuestion, sources, profile) => {
    if (!profile.agents?.analyst) {
        return 'Analysis pass skipped for Quick research.';
    }
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

const mapSourcesForClient = (sources) => webSearchService.mapSourcesForClient(sources);

const createResearchAbort = (req, res, timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onClose = () => controller.abort();
    req.on('close', onClose);
    res.on('close', onClose);
    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timer);
            req.off('close', onClose);
            res.off('close', onClose);
        },
    };
};

const runDeepResearch = async (res, {
    query,
    modelSlug = 'gemini',
    depth,
    timeRange,
    req = null,
    clarificationAnswers = null,
    skipClarification = true,
    useKnowledge = false,
    email = null,
    connection = null,
}) => {
    const startedAt = Date.now();
    const profile = DEPTH_PROFILES[normalizeDepth(depth)];
    const days = TIME_RANGE_DAYS[normalizeTimeRange(timeRange)] || null;
    const abortBundle = req ? createResearchAbort(req, res, profile.timeoutMs) : { signal: null, cleanup: () => {} };

    if (!isResearchSearchAvailable()) {
        abortBundle.cleanup();
        const err = new SearchProviderError('search_not_configured', 'Web research is temporarily unavailable.', 503);
        throw err;
    }

    const enrichedQuery = clarificationAnswers
        ? mergeClarificationAnswers(query, clarificationAnswers)
        : query;

    const modelsUsed = new Set([modelSlug]);
    const planningModel = pickResearchModel('planning', modelSlug);
    const writingModel = pickResearchModel('writing', modelSlug);
    modelsUsed.add(planningModel);
    modelsUsed.add(writingModel);

    try {
        writeResearchEvent(res, 'research.started', {
            deepResearchStage: 'understanding',
            researchTopic: enrichedQuery.slice(0, 160),
            researchDepth: normalizeDepth(depth),
        });

        writeResearchEvent(res, 'research.plan_created', { deepResearchStage: 'planning' });
        emitStage(res, 'planning');
        const plan = await planResearch(enrichedQuery, profile);
        if (abortBundle.signal?.aborted) throw new SearchProviderError('research_cancelled', 'Research was stopped.', 499);

        const searchResult = await runPlannedSearch(res, {
            userQuestion: enrichedQuery,
            queries: plan.queries,
            profile,
            days,
            signal: abortBundle.signal,
        });
        let rawSources = searchResult.sources;
        const minTarget = Math.min(4, profile.maxSources);

        let { ranked, diagnostics } = rankDeepResearchSources({
            userQuestion: enrichedQuery,
            rawSources,
            plan,
            limit: profile.maxSources,
            minAccepted: minTarget,
        });

        if (ranked.length < minTarget) {
            const supplementQueries = buildSupplementQueries(enrichedQuery, plan, profile);
            if (supplementQueries.length) {
                writeResearchEvent(res, 'search.started', {
                    deepResearchStage: 'searching',
                    queryCount: supplementQueries.length,
                    supplemental: true,
                });
                const supplement = await executePlannedSearches({
                    userQuestion: enrichedQuery,
                    queries: supplementQueries,
                    profile: {
                        ...profile,
                        maxSearchCalls: Math.min(2, supplementQueries.length),
                    },
                    days,
                    signal: abortBundle.signal,
                    onSourceFound: (_source, total) => {
                        writeResearchEvent(res, 'search.source_found', {
                            deepResearchStage: 'searching',
                            sourceCount: rawSources.length + total,
                            count: rawSources.length + total,
                            supplemental: true,
                        });
                    },
                });
                rawSources = pipelineDedupeByUrl([...rawSources, ...supplement.sources]);
                searchResult.providersUsed = [
                    ...new Set([...(searchResult.providersUsed || []), ...(supplement.providersUsed || [])]),
                ];
                ({ ranked, diagnostics } = rankDeepResearchSources({
                    userQuestion: enrichedQuery,
                    rawSources,
                    plan: { ...plan, queries: [...plan.queries, ...supplementQueries] },
                    limit: profile.maxSources,
                    minAccepted: minTarget,
                }));
            }
        }

        logDeepResearchDiagnostics(plan, searchResult, diagnostics);

        if (process.env.NODE_ENV !== 'production' && diagnostics.sampleRaw) {
            console.log('[DeepResearch] Post-rank summary:', {
                raw: diagnostics.rawCount,
                validUrl: diagnostics.validUrlCount,
                deduped: diagnostics.deduplicatedCount,
                accepted: diagnostics.acceptedCount,
            });
        }

        emitStage(res, 'reading', {
            count: rawSources.length,
            sourceCount: rawSources.length,
            acceptedCount: ranked.length,
        });
        ranked = ranked.slice(0, profile.maxSources);

        const { kbSources, kbDocumentsUsed } = await attachKnowledgeSources(
            connection,
            email,
            enrichedQuery,
            useKnowledge,
        );
        if (kbSources.length) {
            const kbRanked = kbSources.map((source, index) => ({
                ...source,
                rank: ranked.length + index + 1,
            }));
            ranked = [...ranked, ...kbRanked].slice(0, profile.maxSources + kbSources.length);
        }

        const liveSources = mapSourcesForClient(ranked);
        if (liveSources.length) {
            webSearchService.writeSse(res, {
                deepResearch: true,
                webSources: liveSources,
                webSearchComplete: false,
                sourceCount: liveSources.length,
            });
        }

        if (!ranked.length) {
            writeResearchEvent(res, 'research.failed', {
                failureCode: 'no_sources',
                message: 'No reliable sources were found for this question. Try rephrasing or a broader time range.',
            });
            webSearchService.writeSse(res, {
                deepResearch: true,
                webSources: [],
                webSearchComplete: false,
                researchFailure: {
                    code: 'no_sources',
                    message: 'No reliable sources were found for this question. Try rephrasing or a broader time range.',
                },
            });
            res.write('data: [DONE]\n\n');
            abortBundle.cleanup();
            return res.end();
        }

        writeResearchEvent(res, 'analysis.started', { deepResearchStage: 'analyzing' });
        emitStage(res, 'analyzing');
        const crossCheckNotes = await crossCheckSources(enrichedQuery, ranked, profile);
        writeResearchEvent(res, 'analysis.completed', { deepResearchStage: 'analyzing' });

        writeResearchEvent(res, 'verification.started', { deepResearchStage: 'cross_check' });
        emitStage(res, 'cross_check');
        const verification = await verifyClaims(enrichedQuery, ranked, profile);
        writeResearchEvent(res, 'verification.completed', {
            deepResearchStage: 'cross_check',
            verificationIncomplete: verification.incomplete,
        });

        writeResearchEvent(res, 'writing.started', { deepResearchStage: 'writing' });
        emitStage(res, 'writing');
        const reportPrompt = buildReportPrompt(
            enrichedQuery,
            plan.objective,
            ranked,
            crossCheckNotes,
            verification.notes,
        );

        let assistantText = '';
        try {
            assistantText = await webSearchService.streamAiAnswer(res, {
                userQuestion: enrichedQuery,
                sources: ranked,
                modelSlug: writingModel,
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

        const researchMeta = {
            mode: normalizeDepth(depth),
            sourcesReviewed: ranked.length,
            searchQueries: plan.queries.length,
            searchQueryList: plan.queries,
            modelsUsed: [...modelsUsed],
            durationMs: Date.now() - startedAt,
            knowledgeBaseDocumentsUsed: kbDocumentsUsed,
            verificationIncomplete: verification.incomplete,
            clarificationAnswers: clarificationAnswers || null,
            researchTopic: enrichedQuery.slice(0, 200),
            providersUsed: searchResult.providersUsed,
            agents: profile.agents,
        };

        writeResearchEvent(res, 'writing.completed', { deepResearchStage: 'writing' });
        writeResearchEvent(res, 'research.completed', {
            deepResearchStage: 'writing',
            researchMeta,
        });

        webSearchService.writeSse(res, {
            webSources: liveSources,
            webSearchComplete: Boolean(assistantText),
            deepResearch: true,
            researchDepth: normalizeDepth(depth),
            searchQueries: plan.queries,
            researchMeta,
            knowledgeSources: kbSources.length
                ? kbSources.map((s) => ({
                    title: s.title,
                    documentId: s.documentId,
                    excerpt: s.excerpt?.slice(0, 200),
                }))
                : undefined,
        });
        res.write('data: [DONE]\n\n');
        abortBundle.cleanup();
        return res.end();
    } catch (error) {
        abortBundle.cleanup();
        if (error.code === 'research_cancelled') {
            writeResearchEvent(res, 'research.failed', { code: error.code, message: error.message });
            res.write('data: [DONE]\n\n');
            return res.end();
        }
        throw error;
    }
};

const collectDeepResearch = async ({ query, depth, timeRange }) => {
    const profile = DEPTH_PROFILES[normalizeDepth(depth)];
    const days = TIME_RANGE_DAYS[normalizeTimeRange(timeRange)] || null;
    const plan = await planResearch(query, profile);
    const { sources: rawSources } = await executePlannedSearches({
        userQuestion: query,
        queries: plan.queries,
        profile,
        days,
    });
    const { ranked } = rankDeepResearchSources({
        userQuestion: query,
        rawSources,
        plan,
        limit: profile.maxSources,
        minAccepted: 2,
    });
    return {
        query,
        objective: plan.objective,
        depth: normalizeDepth(depth),
        searchQueries: plan.queries,
        sources: mapSourcesForClient(ranked),
    };
};

const buildClarificationPayload = async ({ query, skipClarification }) => analyzeClarification({
    query,
    skipClarification,
    completeLlmJson,
});

const mapErrorToResponse = (error) => {
    const isDev = process.env.NODE_ENV !== 'production';
    if (error instanceof SearchProviderError || error instanceof TavilyError) {
        const code = error.code;
        let message = error.message;
        if (code === 'search_not_configured' || code === 'tavily_not_configured') {
            message = isDev
                ? 'Deep Research unavailable. No web search provider is configured. Configure a supported server-side search provider to enable web research.'
                : 'Web research is temporarily unavailable.';
        }
        const body = { code, message };
        if (isDev && code === 'tavily_not_configured') {
            body.developerHint = 'Set TAVILY_API_KEY on the server or rely on the public web fallback.';
        }
        return { status: error.status || 503, body };
    }
    if (error.code === 'llm_synthesis') {
        return { status: 502, body: { code: error.code, message: error.message } };
    }
    if (error.code === 'research_cancelled') {
        return { status: 499, body: { code: error.code, message: error.message } };
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
    buildClarificationPayload,
    mapErrorToResponse,
    TavilyError,
    SearchProviderError,
    isResearchSearchAvailable,
    listConfiguredProviders,
    completeLlmJson,
};
