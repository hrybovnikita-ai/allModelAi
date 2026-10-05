/**
 * Citation IDs, client payloads, diversity, and model context formatting.
 */

const { isClearlyUnrelated } = require('./webSearchRelevance');

const normalizeUrlKey = (url) => {
    try {
        const parsed = new URL(String(url || '').trim());
        if (!/^https?:$/i.test(parsed.protocol)) return '';
        parsed.hash = '';
        parsed.search = '';
        let path = parsed.pathname.replace(/\/+$/, '') || '/';
        return `${parsed.hostname.toLowerCase()}${path}`;
    } catch {
        return '';
    }
};

const normalizeTitleKey = (title) => String(title || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);

const isSafeHttpUrl = (url) => {
    try {
        const parsed = new URL(String(url || '').trim());
        return /^https?:$/i.test(parsed.protocol);
    } catch {
        return false;
    }
};

const diversifySources = (ranked, limit = 6) => {
    const picked = [];
    const urlKeys = new Set();
    const titleKeys = new Set();
    const domainCounts = new Map();
    const typesSeen = new Set();

    for (const source of ranked) {
        const urlKey = normalizeUrlKey(source.url);
        if (urlKey && urlKeys.has(urlKey)) continue;

        const titleKey = normalizeTitleKey(source.title);
        if (titleKey && titleKeys.has(titleKey)) continue;

        const domain = String(source.domain || '').toLowerCase();
        const domainUses = domainCounts.get(domain) || 0;
        if (domain && domainUses >= 1 && picked.length >= 2 && typesSeen.has(source.sourceType)) {
            continue;
        }

        picked.push(source);
        if (urlKey) urlKeys.add(urlKey);
        if (titleKey) titleKeys.add(titleKey);
        if (domain) domainCounts.set(domain, domainUses + 1);
        if (source.sourceType) typesSeen.add(source.sourceType);

        if (picked.length >= limit) break;
    }

    return picked;
};

const assignCitationIds = (sources) => sources.map((source, index) => {
    const citationId = index + 1;
    return {
        ...source,
        citationId,
        rank: citationId,
    };
});

const mapSourcesForClient = (sources) => sources.map((source) => ({
    citationId: source.citationId ?? source.rank,
    rank: source.citationId ?? source.rank,
    title: source.title,
    url: isSafeHttpUrl(source.url) ? source.url : '',
    domain: source.domain,
    excerpt: String(source.excerpt || source.snippet || '').slice(0, 320),
    publishedDate: source.publishedDate || null,
}));

const formatSourceContextForModel = (sources) => {
    if (!sources.length) return 'No web sources were retrieved.';

    return sources.map((source) => {
        const id = source.citationId ?? source.rank;
        return [
            `[${id}] citationId=${id}`,
            `title: ${source.title}`,
            `url: ${source.url}`,
            `domain: ${source.domain}`,
            `sourceType: ${source.sourceType || 'secondary'}`,
            `snippet: ${String(source.snippet || source.excerpt || '').slice(0, 400)}`,
        ].join('\n');
    }).join('\n\n');
};

const buildCitationInstructions = (sourceCount) => `Citation rules (mandatory):
- Use ONLY citation IDs [1] through [${sourceCount}] that appear in the source list below.
- Cite a source ONLY when its snippet supports the specific claim (not title similarity alone).
- Never invent citation numbers or sources.
- For prices, compensation amounts, schedules, delays, laws, policies, weather, or current events: if no source confirms the fact, say it could not be confirmed from the retrieved sources.
- Prefer official/regulator/operator sources [sourceType government_regulator, official_operator, international_public] for numeric or policy claims when available.
- Reply in the same language as the user's question.`;

const MIN_COMBINED_SCORE = 48;

const finalizeRankedSources = (userQuestion, scoredSources, limit = 6) => {
    const filtered = scoredSources
        .filter((s) => s.combinedScore >= MIN_COMBINED_SCORE && s.title && isSafeHttpUrl(s.url))
        .filter((s) => !isClearlyUnrelated(userQuestion, s))
        .sort((a, b) => b.combinedScore - a.combinedScore);

    const diverse = diversifySources(filtered, limit);
    return assignCitationIds(diverse);
};

module.exports = {
    assignCitationIds,
    buildCitationInstructions,
    diversifySources,
    finalizeRankedSources,
    formatSourceContextForModel,
    isSafeHttpUrl,
    mapSourcesForClient,
    normalizeUrlKey,
};
