/**
 * Concept-based source relevance for web search.
 */

const { extractSearchIntent } = require('./webSearchQueryBuilder');

const STOP_WORDS = new Set([
    'the', 'best', 'for', 'me', 'find', 'a', 'an', 'is', 'are', 'what', 'how', 'tell', 'show', 'get',
    'please', 'can', 'you', 'could', 'would', 'some', 'any', 'top', 'good', 'great', 'list', 'give',
    'сколько', 'стоит', 'стоимость', 'скажи', 'найди', 'покажи', 'скільки', 'коштує',
]);

const TOKEN_ALIASES = {
    kyiv: ['kyiv', 'kiev', 'киев', 'київ'],
    warsaw: ['warsaw', 'варшава', 'warszawa', 'central'],
    train: ['train', 'rail', 'railway', 'поезд', 'поезда', 'поїзд', 'потяг', 'intercity'],
    delay: ['delay', 'delayed', 'late', 'задерж', 'затрим', 'opóźn'],
    compensation: ['compensation', 'refund', 'компенсац', 'возмещ', 'passenger', 'rights'],
    weather: ['weather', 'forecast', 'погод', 'temperature'],
    python: ['python', 'guido', 'rossum'],
};

const SPORTS_MARKERS = /\b(nba|nfl|mlb|nhl|wizards|lakers|celtics|basketball|playoffs)\b/i;
const ENCYCLOPEDIA_DOMAINS = /(^|\.)wikipedia\.org$|(^|\.)britannica\.com$|(^|\.)wikivoyage\.org$/i;
const GEOGRAPHY_TITLE = /\b(city|capital|history|facts|points of interest|geography|population|map)\b/i;
const OPERATIONAL_MARKERS = /\b(train|rail|delay|compensation|passenger|schedule|ticket|intercity|pkp|ukrzaliznytsia|weather|forecast|price|news|regulation)\b/i;

const tokenize = (text) => [...new Set(String(text || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])];

const meaningfulTokens = (text) => tokenize(text).filter((token) => !STOP_WORDS.has(token) && token.length > 1);

const expandTokens = (tokens) => {
    const expanded = new Set(tokens);
    tokens.forEach((token) => {
        Object.entries(TOKEN_ALIASES).forEach(([canonical, forms]) => {
            if (forms.some((form) => form === token || token.includes(form) || form.includes(token))) {
                expanded.add(canonical);
                forms.forEach((form) => expanded.add(form));
            }
        });
    });
    return [...expanded];
};

const intentConceptTokens = (intent) => {
    const tokens = new Set();
    const { concepts } = intent;
    concepts.locations.forEach((loc) => meaningfulTokens(loc).forEach((t) => tokens.add(t)));
    if (concepts.route) {
        meaningfulTokens(`${concepts.route.from} ${concepts.route.to}`).forEach((t) => tokens.add(t));
    }
    concepts.transport.forEach((t) => tokens.add(t));
    concepts.topics.forEach((t) => tokens.add(t));
    expandTokens([...tokens]).forEach((t) => tokens.add(t));
    return [...tokens];
};

const detectQueryProfile = (userQuestion) => {
    const intent = extractSearchIntent(userQuestion);
    return {
        ...intent,
        isProductPrice: /iphone|айфон|macbook|subscription|\$\d/i.test(intent.raw),
        needsRecency: intent.isNews || intent.isOperationalCurrent || intent.isWeather,
    };
};

const countTokenOverlap = (queryTokens, blob) => {
    const expanded = expandTokens(queryTokens);
    let hits = 0;
    expanded.forEach((token) => {
        if (token.length >= 3 && blob.includes(token)) hits += 1;
    });
    return hits;
};

const countConceptOverlap = (intent, blob) => {
    const concepts = intentConceptTokens(intent);
    let hits = 0;
    concepts.forEach((token) => {
        if (token.length >= 3 && blob.includes(token)) hits += 1;
    });
    return { hits, total: concepts.length };
};

const isGeographyEncyclopediaNoise = (source, intent) => {
    if (!intent.isOperationalCurrent || intent.isGeneralKnowledge) return false;
    const domain = String(source.domain || '').toLowerCase();
    const title = String(source.title || '');
    const blob = `${title} ${source.excerpt || ''}`.toLowerCase();

    if (!ENCYCLOPEDIA_DOMAINS.test(domain)) return false;
    if (OPERATIONAL_MARKERS.test(blob)) return false;

    const { hits, total } = countConceptOverlap(intent, blob);
    const locationOnly = intent.concepts.locations.some((loc) => {
        const locToken = loc.split(/\s+/)[0].toLowerCase();
        return title.toLowerCase().includes(locToken) && !OPERATIONAL_MARKERS.test(blob);
    });

    if (locationOnly && hits <= 2 && total >= 4) return true;
    if (GEOGRAPHY_TITLE.test(blob) && !OPERATIONAL_MARKERS.test(blob)) return true;
    if (/^[\p{L}\s-]+ (- Wikipedia| \| Britannica)$/u.test(title) && !OPERATIONAL_MARKERS.test(blob)) return true;

    return false;
};

const isClearlyUnrelated = (userQuestion, source) => {
    const intent = extractSearchIntent(userQuestion);
    const blob = `${source.title} ${source.excerpt} ${source.domain} ${source.url}`.toLowerCase();

    if (isGeographyEncyclopediaNoise(source, intent)) return true;

    if (intent.isTravelRail && SPORTS_MARKERS.test(blob)) return true;

    const { hits, total } = countConceptOverlap(intent, blob);
    if (intent.isOperationalCurrent && total >= 4 && hits < 2) return true;

    if (intent.isTravelRail && hits < 2 && !OPERATIONAL_MARKERS.test(blob)) return true;

    if (intent.isWeather && !/weather|forecast|temperature|погод|meteo/i.test(blob)) return true;

    return false;
};

const authorityBonusFor = (domain, url, intent) => {
    let bonus = 0;
    const host = String(domain || '').toLowerCase();
    const full = `${host} ${url}`.toLowerCase();

    if (intent.isTravelRail || intent.concepts.transport.includes('train')) {
        if (/intercity\.pl|pkp\.pl|uz\.gov|ukrzaliznytsia|ec\.europa\.eu|rail/i.test(full)) bonus += 45;
    }
    if (intent.isWeather && /meteo|weather\.gov|accuweather|weather\.com/i.test(full)) bonus += 25;
    if (intent.isNews && /reuters\.|bbc\.|apnews\.|techcrunch\.|theverge\./i.test(full)) bonus += 22;
    if (/\.gov(\.|$)|\.edu(\.|$)/i.test(host)) bonus += 28;

    if (ENCYCLOPEDIA_DOMAINS.test(host)) {
        if (intent.isGeneralKnowledge) bonus += 18;
        else if (intent.isOperationalCurrent) bonus -= 35;
    }

    return bonus;
};

const MIN_RELEVANCE_SCORE = 48;

const scoreSourceRelevance = (userQuestion, source, rankIndex = 0) => {
    const intent = extractSearchIntent(userQuestion);
    const queryTokens = meaningfulTokens(userQuestion);
    const blob = `${source.title} ${source.excerpt} ${source.domain}`.toLowerCase();

    if (isClearlyUnrelated(userQuestion, source)) {
        return { score: -100, relevanceScore: 0 };
    }

    const tokenOverlap = countTokenOverlap(queryTokens, blob);
    const concept = countConceptOverlap(intent, blob);

    let score = Math.max(0, 20 - rankIndex * 2);
    score += Math.min(tokenOverlap * 10, 40);
    score += Math.min(concept.hits * 12, 48);

    if (intent.isOperationalCurrent && concept.total >= 3 && concept.hits < 2) {
        score -= 55;
    }

    if (typeof source.score === 'number' && source.score > 0) {
        score += Math.min(source.score * 18, 22);
    }

    if (concept.hits >= 2 || tokenOverlap >= 2) {
        score += authorityBonusFor(source.domain, source.url, intent);
    }

    if (ENCYCLOPEDIA_DOMAINS.test(source.domain || '') && intent.isOperationalCurrent && !intent.isGeneralKnowledge) {
        score -= 45;
    }

    const relevanceScore = Math.max(0, Math.min(100, Math.round(score)));
    return { score, relevanceScore };
};

const averageRelevance = (sources) => {
    if (!sources.length) return 0;
    return sources.reduce((sum, s) => sum + (s.relevanceScore || 0), 0) / sources.length;
};

const needsSearchRetry = (rankedSources, intent) => {
    if (!intent.isOperationalCurrent && !intent.isTravelRail && !intent.isWeather && !intent.isNews) {
        return false;
    }
    if (!rankedSources.length) return true;
    if (averageRelevance(rankedSources) < 52) return true;
    if (rankedSources.every((s) => ENCYCLOPEDIA_DOMAINS.test(s.domain || ''))) return true;
    return false;
};

module.exports = {
    MIN_RELEVANCE_SCORE,
    averageRelevance,
    authorityBonusFor,
    countConceptOverlap,
    countTokenOverlap,
    detectQueryProfile,
    expandTokens,
    isClearlyUnrelated,
    isGeographyEncyclopediaNoise,
    meaningfulTokens,
    needsSearchRetry,
    scoreSourceRelevance,
    tokenize,
};
