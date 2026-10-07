/**
 * Deep Research source normalization, topic-aware ranking, and dev diagnostics.
 */

const webSearchService = require('../webSearchService');
const { isClearlyUnrelated } = require('../webSearchRelevance');
const { isSafeHttpUrl } = require('../webSourceCitations');

const DEEP_MIN_COMBINED = 32;
const DEEP_RELAXED_MIN = 22;

const LOW_QUALITY = [
    /pixabay\.com/i,
    /pinterest\.(com|ru)/i,
    /shutterstock\.com/i,
    /freepik\.com/i,
    /alamy\.com/i,
    /unsplash\.com/i,
];

const TECH_PRODUCT_AUTHORITY = [
    { pattern: /github\.com/i, bonus: 28 },
    { pattern: /docs\.(github|microsoft|google|openai|anthropic)/i, bonus: 35 },
    { pattern: /docs\.python\.org|python\.org/i, bonus: 38 },
    { pattern: /oreilly\.com|manning\.com|packtpub\.com|nostarch\.com/i, bonus: 30 },
    { pattern: /openai\.com|anthropic\.com|cursor\.com|codeium\.com|tabnine\.com/i, bonus: 32 },
    { pattern: /stackoverflow\.com/i, bonus: 24 },
    { pattern: /dev\.to|medium\.com|realpython\.com|freecodecamp\.org/i, bonus: 18 },
    { pattern: /theverge\.com|techcrunch\.com|arstechnica\.com|wired\.com/i, bonus: 22 },
    { pattern: /wikipedia\.org/i, bonus: 12 },
    { pattern: /\.edu(\.|$)/i, bonus: 20 },
];

const RESEARCH_EXPANSIONS = [
    { re: /(?:^|\s)(ии|шi|штучн|artificial intelligence|ai assistant|ai coding)/i, add: 'AI coding assistant developer tools software' },
    { re: /(?:помощник|помічник|assistant|copilot|асистент)/i, add: 'AI assistant coding copilot pair programming' },
    { re: /(?:код|програм|programming|developer|разработ)/i, add: 'programming software development code editor IDE' },
    { re: /(?:python|пython)/i, add: 'Python programming books courses documentation' },
    { re: /(?:книг|book)/i, add: 'books learning resources recommendations' },
];

const tokenize = (text) => [...new Set(String(text || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])];

const buildResearchMatchContext = (userQuestion, plan = {}) => {
    const chunks = [
        userQuestion,
        plan.objective,
        ...(plan.queries || []),
    ].filter(Boolean);

    RESEARCH_EXPANSIONS.forEach(({ re, add }) => {
        if (re.test(userQuestion) || re.test(plan.objective || '')) {
            chunks.push(add);
        }
    });

    return chunks.join(' ').slice(0, 1200);
};

const detectResearchProfile = (userQuestion, plan) => {
    const blob = `${userQuestion} ${plan.objective || ''} ${(plan.queries || []).join(' ')}`.toLowerCase();
    return {
        isProductResearch: /ai|assistant|copilot|cursor|tool|product|software|app|ide|programming|developer|код|програм|помощник|помічник|асистент|інструмент/i.test(blob),
        isBookLearning: /book|books|книг|learn|study|course|tutorial|ресурс/i.test(blob),
    };
};

const coerceHttpUrl = (rawUrl) => {
    let url = String(rawUrl || '').trim();
    if (!url) return '';
    if (url.startsWith('//')) url = `https:${url}`;
    if (!/^https?:\/\//i.test(url)) return '';
    return url;
};

const normalizeRawSource = (raw, provider = 'unknown') => {
    const url = coerceHttpUrl(raw.url || raw.link || raw.href || raw.source_url);
    const title = String(raw.title || raw.name || raw.page_title || '').trim();
    const body = raw.excerpt || raw.content || raw.snippet || raw.description || raw.text || raw.body || '';
    let excerpt = String(body).trim().slice(0, 1200);
    const domain = String(raw.domain || webSearchService.extractDomain(url) || '').replace(/^www\./, '');

    if (!excerpt && title) {
        excerpt = title.slice(0, 320);
    }

    return {
        id: raw.id || url || `${provider}:${title.slice(0, 40)}`,
        title: title || domain || 'Untitled',
        url,
        domain,
        excerpt,
        snippet: excerpt.slice(0, 320),
        content: excerpt,
        provider: raw.provider || provider,
        score: typeof raw.score === 'number' ? raw.score : null,
        publishedDate: raw.publishedDate || raw.published_date || raw.publishedAt || null,
    };
};

/** @alias normalizeRawSource */
const normalizeSearchResult = normalizeRawSource;

const isValidResearchCandidate = (source) => {
    if (!source?.title || !isSafeHttpUrl(source.url)) return false;
    const text = String(source.excerpt || source.snippet || source.title || '').trim();
    return text.length >= 2;
};

const normalizeSourceBatch = (batch, provider) => batch
    .map((item) => normalizeRawSource(item, provider))
    .filter(isValidResearchCandidate);

const rejectReason = (source, profile, userQuestion) => {
    if (!isSafeHttpUrl(source.url)) return 'invalid URL';
    if (!String(source.title || '').trim()) return 'missing title';
    const hasText = Boolean(String(source.excerpt || source.snippet || source.title || '').trim());
    if (!hasText && !profile.isProductResearch && !profile.isBookLearning) {
        return 'missing content';
    }
    if (LOW_QUALITY.some((re) => re.test(source.url) || re.test(source.domain || ''))) {
        return 'low quality domain';
    }
    if (!profile.isProductResearch && !profile.isBookLearning && isClearlyUnrelated(userQuestion, source)) {
        return 'unrelated to research context';
    }
    return null;
};

const scoreDeepResearchSource = (source, matchContext, profile) => {
    const blob = `${source.title} ${source.excerpt} ${source.domain} ${source.url}`.toLowerCase();
    const contextTokens = tokenize(matchContext);
    let score = 26;

    contextTokens.forEach((token) => {
        if (token.length >= 3 && blob.includes(token)) score += 6;
    });

    if (typeof source.score === 'number' && source.score > 0) {
        score += Math.min(source.score * 22, 24);
    }

    TECH_PRODUCT_AUTHORITY.forEach(({ pattern, bonus }) => {
        if (pattern.test(source.url) || pattern.test(source.domain || '')) score += bonus;
    });

    if (profile.isProductResearch) {
        if (/copilot|cursor|claude|chatgpt|codeium|tabnine|windsurf|github|jetbrains|replit|assistant|coding|developer|programming/i.test(blob)) {
            score += 18;
        }
    }

    if (profile.isBookLearning) {
        if (/book|author|publisher|oreilly|manning|packt|review|reading|python|tutorial|learn|course|guide/i.test(blob)) {
            score += 16;
        }
    }

    return Math.max(0, Math.min(100, Math.round(score)));
};

const dedupeByUrl = (sources) => {
    const map = new Map();
    sources.forEach((source) => {
        const key = String(source.url || '').split('#')[0].replace(/\/$/, '').toLowerCase();
        if (!key) return;
        const existing = map.get(key);
        if (!existing || (source.combinedScore || 0) > (existing.combinedScore || 0)) {
            map.set(key, source);
        }
    });
    return [...map.values()];
};

const rankDeepResearchSources = ({
    userQuestion,
    rawSources,
    plan,
    limit = 14,
    minAccepted = 3,
}) => {
    const matchContext = buildResearchMatchContext(userQuestion, plan);
    const profile = detectResearchProfile(userQuestion, plan);
    const normalized = rawSources.map((s) => normalizeRawSource(s, s.provider || 'merged'));
    const validUrl = normalized.filter((s) => isSafeHttpUrl(s.url));
    const deduped = dedupeByUrl(validUrl);

    const scored = [];
    const rejected = [];

    deduped.forEach((source) => {
        const reason = rejectReason(source, profile, userQuestion);
        const combinedScore = scoreDeepResearchSource(source, matchContext, profile);
        const entry = { ...source, combinedScore, relevanceScore: combinedScore };

        if (reason) {
            rejected.push({ source: entry, reason });
            return;
        }
        if (combinedScore < DEEP_MIN_COMBINED) {
            rejected.push({ source: entry, reason: 'below relevance threshold' });
            return;
        }
        scored.push(entry);
    });

    scored.sort((a, b) => b.combinedScore - a.combinedScore);

    let accepted = scored.slice(0, limit);

    if (accepted.length < minAccepted && deduped.length) {
        const relaxed = deduped
            .map((source) => {
                const combinedScore = scoreDeepResearchSource(source, matchContext, profile);
                return { ...source, combinedScore, relevanceScore: combinedScore };
            })
            .filter((source) => {
                const reason = rejectReason(source, profile, userQuestion);
                if (reason === 'invalid URL' || reason === 'missing title' || reason === 'low quality domain') return false;
                if (reason === 'unrelated to research context') return false;
                if (reason === 'missing content') return true;
                return true;
            })
            .filter((source) => source.combinedScore >= DEEP_RELAXED_MIN && isSafeHttpUrl(source.url))
            .sort((a, b) => b.combinedScore - a.combinedScore);

        const seen = new Set(accepted.map((s) => s.url));
        relaxed.forEach((source) => {
            if (accepted.length >= limit) return;
            if (seen.has(source.url)) return;
            accepted.push(source);
            seen.add(source.url);
        });
    }

    accepted = accepted.map((source, index) => ({
        ...source,
        citationId: index + 1,
        rank: index + 1,
    }));

    const qualityFilteredCount = scored.length;
    const diagnostics = {
        matchContextPreview: matchContext.slice(0, 160),
        researchProfile: profile,
        rawCount: rawSources.length,
        normalizedCount: normalized.length,
        validUrlCount: validUrl.length,
        deduplicatedCount: deduped.length,
        qualityFilteredCount,
        acceptedCount: accepted.length,
        rejectedCount: rejected.length,
        sampleRaw: rawSources[0] ? {
            keys: Object.keys(rawSources[0]),
            title: rawSources[0].title,
            url: rawSources[0].url,
            hasExcerpt: Boolean(rawSources[0].excerpt),
            hasContent: Boolean(rawSources[0].content),
        } : null,
        rejected: rejected.slice(0, 25).map(({ source, reason }) => ({
            reason,
            url: source.url,
            domain: source.domain,
            title: String(source.title || '').slice(0, 80),
            score: source.combinedScore,
            provider: source.provider,
        })),
        accepted: accepted.map((s) => ({
            url: s.url,
            domain: s.domain,
            score: s.combinedScore,
            provider: s.provider,
        })),
    };

    return { ranked: accepted, diagnostics };
};

const logDeepResearchDiagnostics = (plan, searchMeta, pipelineDiagnostics) => {
    if (process.env.NODE_ENV === 'production') return;

    console.log('[DeepResearch] --- source pipeline diagnostics ---');
    (plan.queries || []).forEach((query, index) => {
        console.log(`[DeepResearch] Query ${index + 1}: ${query}`);
    });
    console.log(`[DeepResearch] Providers used: ${(searchMeta.providersUsed || []).join(', ') || 'unknown'}`);
    console.log(`[DeepResearch] RAW SEARCH RESULTS: ${pipelineDiagnostics.rawCount}`);
    console.log(`[DeepResearch] NORMALIZED RESULTS: ${pipelineDiagnostics.normalizedCount}`);
    console.log(`[DeepResearch] VALID URL RESULTS: ${pipelineDiagnostics.validUrlCount ?? pipelineDiagnostics.normalizedCount}`);
    console.log(`[DeepResearch] DEDUPLICATED RESULTS: ${pipelineDiagnostics.deduplicatedCount}`);
    console.log(`[DeepResearch] QUALITY FILTERED RESULTS: ${pipelineDiagnostics.qualityFilteredCount ?? 'n/a'}`);
    console.log(`[DeepResearch] FINAL RESEARCH SOURCES: ${pipelineDiagnostics.acceptedCount}`);
    console.log(`[DeepResearch] Rejected: ${pipelineDiagnostics.rejectedCount}`);
    if (pipelineDiagnostics.sampleRaw) {
        console.log('[DeepResearch] Sample raw result shape:', JSON.stringify(pipelineDiagnostics.sampleRaw));
    }
    if (pipelineDiagnostics.rejected.length) {
        console.log('[DeepResearch] Reject reasons (sample):');
        pipelineDiagnostics.rejected.forEach((row) => {
            console.log(`  - ${row.reason} | ${row.domain || row.url} | score=${row.score}`);
        });
    }
};

const buildSupplementQueries = (userQuestion, plan, profile) => {
    const existing = new Set((plan.queries || []).map((q) => q.toLowerCase()));
    const extras = [];
    const researchProfile = detectResearchProfile(userQuestion, plan);

    if (researchProfile.isProductResearch) {
        [
            'best AI coding assistants for professional developers',
            'GitHub Copilot vs Cursor vs Claude Code comparison',
            'AI developer tools official documentation',
        ].forEach((q) => {
            if (!existing.has(q.toLowerCase())) extras.push(q);
        });
    }
    if (researchProfile.isBookLearning) {
        [
            'best advanced Python books senior developer',
            'Python programming books O\'Reilly Manning review',
        ].forEach((q) => {
            if (!existing.has(q.toLowerCase())) extras.push(q);
        });
    }

    if (!extras.length) {
        extras.push(`${userQuestion.slice(0, 120)} official sources`);
        extras.push(`${userQuestion.slice(0, 80)} comparison review`);
    }

    return extras.slice(0, 3);
};

module.exports = {
    buildResearchMatchContext,
    buildSupplementQueries,
    normalizeRawSource,
    normalizeSearchResult,
    normalizeSourceBatch,
    isValidResearchCandidate,
    rankDeepResearchSources,
    logDeepResearchDiagnostics,
    dedupeByUrl,
};
