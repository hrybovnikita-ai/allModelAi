/**
 * Query preservation and source relevance for public web search (Bing/DDG/Wikipedia/Tavily).
 */

const STOP_WORDS = new Set([
    'the', 'best', 'for', 'me', 'find', 'a', 'an', 'is', 'are', 'what', 'how', 'tell', 'show', 'get',
    'please', 'can', 'you', 'could', 'would', 'some', 'any', 'top', 'good', 'great', 'list', 'give',
    'сколько', 'стоит', 'стоимость', 'скажи', 'найди', 'покажи', 'скільки', 'коштує',
]);

/** Map canonical topic tokens to surface forms (Latin + Cyrillic). */
const TOKEN_ALIASES = {
    kyiv: ['kyiv', 'kiev', 'киев', 'київ', 'kiyv'],
    warsaw: ['warsaw', 'варшава', 'warszawa'],
    train: ['train', 'rail', 'railway', 'поезд', 'поїзд', 'потяг', 'zug', 'intercity'],
    delay: ['delay', 'delayed', 'late', 'задерж', 'затрим', 'opóźn', 'opozn'],
    compensation: ['compensation', 'refund', 'компенсац', 'возмещ', 'passenger rights', 'права пассаж'],
    ukrzaliznytsia: ['ukrzaliznytsia', 'укрзал', 'uz.gov', 'uz.ua'],
    pkp: ['pkp', 'intercity.pl'],
};

const SPORTS_MARKERS = /\b(nba|nfl|mlb|nhl|wizards|lakers|celtics|basketball|playoffs|touchdown|quarterback|soccer league standings)\b/i;

const RAIL_MARKERS = /\b(поезд|поїзд|train|rail|pkp|intercity|ukrzaliznytsia|укрзал|залізниц|railway|маршрут)\b|->|→/i;

const LOCATION_MARKERS = /\b(kyiv|kiev|киев|київ|warsaw|варшава|warszawa|ukraine|poland|украин|польщ)\b/i;

const tokenize = (text) => [...new Set(String(text || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])];

const meaningfulTokens = (text) => tokenize(text).filter((token) => !STOP_WORDS.has(token) && token.length > 1);

const expandTokens = (tokens) => {
    const expanded = new Set(tokens);
    tokens.forEach((token) => {
        Object.entries(TOKEN_ALIASES).forEach(([canonical, forms]) => {
            if (forms.some((form) => form.includes(token) || token.includes(form) || form === token)) {
                expanded.add(canonical);
                forms.forEach((form) => expanded.add(form));
            }
        });
    });
    return [...expanded];
};

const detectQueryProfile = (userQuestion) => {
    const text = String(userQuestion || '');
    const lower = text.toLowerCase();
    return {
        isTravelRail: RAIL_MARKERS.test(lower) || (LOCATION_MARKERS.test(lower) && /delay|задерж|затрим|schedule|распис|компенсац|ticket|бilet|квиток/i.test(lower)),
        mentionsSports: SPORTS_MARKERS.test(lower),
        isCompensationOrDelay: /задерж|delay|compensation|компенсац|refund|passenger rights|опоздан|late train/i.test(lower),
        isProductPrice: /iphone|айфон|macbook|subscription|подписк|\$\d|usd price/i.test(lower),
        needsRecency: /today|сегодня|сейчас|current|latest|202[4-9]|актуал|новост|news/i.test(lower),
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

const isClearlyUnrelated = (userQuestion, source) => {
    const profile = detectQueryProfile(userQuestion);
    const blob = `${source.title} ${source.excerpt} ${source.domain} ${source.url}`.toLowerCase();
    const queryTokens = meaningfulTokens(userQuestion);
    const overlap = countTokenOverlap(queryTokens, blob);

    if (profile.isTravelRail && !profile.mentionsSports && SPORTS_MARKERS.test(blob)) {
        return true;
    }

    if (queryTokens.length >= 2 && overlap === 0) {
        if (profile.isTravelRail && SPORTS_MARKERS.test(blob)) return true;
        if (/news\.google\.com/i.test(source.url) && overlap === 0) return true;
    }

    if (profile.isTravelRail && overlap === 0 && !/(rail|train|pkp|intercity|ukr|uz\.|ec\.europa|passenger|transport|ztm|polregio|eurostar)/i.test(blob)) {
        return true;
    }

    return false;
};

const authorityBonusFor = (domain, url, profile) => {
    let bonus = 0;
    const host = String(domain || '').toLowerCase();
    const full = `${host} ${url}`.toLowerCase();

    if (profile.isTravelRail) {
        if (/uz\.gov|ukrzaliznytsia|ukraine\.ua|intercity\.pl|pkp\.pl|ec\.europa\.eu|transport\.gov|rail/i.test(full)) bonus += 40;
    }
    if (/\.gov(\.|$)|\.edu(\.|$)/i.test(host)) bonus += 30;
    if (/(^|\.)wikipedia\.org$/i.test(host)) bonus += 15;
    if (/(^|\.)reuters\.com$|(^|\.)bbc\.(com|co\.uk)$/i.test(host)) bonus += 12;

    return bonus;
};

const MIN_RELEVANCE_SCORE = 42;

const scoreSourceRelevance = (userQuestion, source, rankIndex = 0) => {
    const profile = detectQueryProfile(userQuestion);
    const queryTokens = meaningfulTokens(userQuestion);
    const blob = `${source.title} ${source.excerpt} ${source.domain}`.toLowerCase();

    if (isClearlyUnrelated(userQuestion, source)) {
        return { score: -100, relevanceScore: 0 };
    }

    const overlap = countTokenOverlap(queryTokens, blob);
    let score = Math.max(0, 24 - rankIndex * 2);
    score += Math.min(overlap * 14, 56);

    if (typeof source.score === 'number' && source.score > 0) {
        score += Math.min(source.score * 20, 25);
    }

    const relevanceRatio = queryTokens.length ? overlap / Math.max(queryTokens.length, 3) : 0;
    if (queryTokens.length >= 2 && overlap < 1) {
        score -= 40;
    } else if (relevanceRatio >= 0.25) {
        score += 12;
    }

    if (relevanceRatio >= 0.15 || overlap >= 2) {
        score += authorityBonusFor(source.domain, source.url, profile);
    }

    if (SPORTS_MARKERS.test(blob) && profile.isTravelRail && !profile.mentionsSports) {
        score -= 80;
    }

    const relevanceScore = Math.max(0, Math.min(100, Math.round(score)));
    return { score, relevanceScore };
};

module.exports = {
    MIN_RELEVANCE_SCORE,
    authorityBonusFor,
    countTokenOverlap,
    detectQueryProfile,
    expandTokens,
    isClearlyUnrelated,
    meaningfulTokens,
    scoreSourceRelevance,
    tokenize,
};
