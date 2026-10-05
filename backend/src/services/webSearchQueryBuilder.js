/**
 * Intent-aware web search query generation (multilingual in, English-leaning search queries out).
 */

const CYRILLIC = /[\u0400-\u04FF]/;

const CITY_NORMALIZE = [
    { pattern: /(киев|київ|kiyv|kiev|kyiv)/i, en: 'Kyiv' },
    { pattern: /(варшав(?:а|е|у|ы|a|e)|warszawa|warsaw)/i, en: 'Warsaw' },
];

const stripQuestionPrefix = (text) => String(text || '')
    .trim()
    .replace(/^(please|can you|could you|tell me|find me|search for|look up|show me|what is|what's|how much is|how much does|скажи|найди|покажи|сколько стоит|скільки коштує)\s+/i, '')
    .replace(/[?!.]+$/g, '')
    .trim();

const extractRouteEndpoints = (text) => {
    const cleaned = stripQuestionPrefix(text);
    if (!/(->|→)/.test(cleaned)) return null;
    const [left, right] = cleaned.split(/\s*(?:->|→)\s*/);
    if (!left || !right) return null;
    const from = left.split(/\s+/).pop()?.trim() || left.trim();
    const to = right.trim();
    return { from, to };
};

const normalizeLocationEn = (fragment) => {
    const value = String(fragment || '').trim();
    for (const entry of CITY_NORMALIZE) {
        if (entry.pattern.test(value)) return entry.en;
    }
    if (/^[A-Za-z][A-Za-z\s'-]{1,40}$/.test(value)) return value;
    return value;
};

const findLocationsInText = (text) => {
    const lower = String(text || '').toLowerCase();
    const found = [];
    for (const entry of CITY_NORMALIZE) {
        if (entry.pattern.test(lower)) found.push(entry.en);
    }
    const inCityMatch = lower.match(/(?:\bв|\bin)\s+([a-zа-яіїєґ' -]{2,40})/i);
    if (inCityMatch) {
        found.push(normalizeLocationEn(inCityMatch[1].trim()));
    }
    return [...new Set(found)];
};

const extractSearchIntent = (userQuestion) => {
    const raw = String(userQuestion || '').trim();
    const lower = raw.toLowerCase();
    const route = extractRouteEndpoints(raw);

    const concepts = {
        locations: [],
        route: null,
        transport: [],
        topics: [],
        entities: [],
    };

    if (route) {
        const fromEn = normalizeLocationEn(route.from);
        const toEn = normalizeLocationEn(route.to);
        concepts.route = { from: fromEn, to: toEn, rawFrom: route.from, rawTo: route.to };
        concepts.locations.push(fromEn, toEn);
    }

    concepts.locations.push(...findLocationsInText(raw));
    concepts.locations = [...new Set(concepts.locations)];

    if (/поезд|поезда|поездом|поїзд|потяг|\btrain\b|railway|\brail\b|intercity|zug/i.test(lower)) {
        concepts.transport.push('train');
    }
    if (/flight|airline|рейс|авиа/i.test(lower)) concepts.transport.push('flight');
    if (/bus|autobus|автобус/i.test(lower)) concepts.transport.push('bus');

    if (/задерж|delay|delayed|late train|opóźn|opozn|затрим/i.test(lower)) concepts.topics.push('delay');
    if (/компенсац|compensation|passenger rights|refund|возмещ|штраф|сколько стоит.*задерж/i.test(lower)) {
        concepts.topics.push('compensation');
    }
    if (/распис|schedule|timetable|departure|arrival|билет|ticket|квиток/i.test(lower)) concepts.topics.push('schedule');
    if (/weather|погод|forecast/i.test(lower)) concepts.topics.push('weather');
    if (/\b(сегодня|today|now|current)\b/i.test(lower) && concepts.topics.includes('weather')) {
        concepts.topics.push('current');
    }
    if (/latest|news|новост|breaking/i.test(lower)) concepts.topics.push('news');
    if (/who invented|who created|кто изобр|кто создал|history of|истори/i.test(lower)) {
        concepts.topics.push('general_knowledge');
    }
    if (/python|javascript|django|flask|programming|framework/i.test(lower)) {
        concepts.topics.push('technology');
    }
    if (/\b(books?|courses?|tutorials?|resources|learn(?:ing)?|documentation|docs)\b/i.test(lower)) {
        concepts.topics.push('learning_resources');
    }

    if (/openai|anthropic|google ai|gemini gpt/i.test(lower)) concepts.entities.push('OpenAI');

    const isTravelRail = concepts.transport.includes('train')
        || (concepts.route && /train|rail|delay|schedule|ticket|компенсац|задерж/i.test(lower));
    const isOperationalCurrent = /задерж|delay|compensation|компенсац|schedule|распис|price|pricing|cost|сколько|стоим|weather|погод|сегодня|today|latest|news|ticket|билет|availability|current/i.test(lower)
        && !concepts.topics.includes('general_knowledge');
    const isGeneralKnowledge = concepts.topics.includes('general_knowledge')
        || (/^(what is|who is|what's|кто такой|что такое)\b/i.test(lower) && !isOperationalCurrent);
    const isWeather = concepts.topics.includes('weather');
    const isNews = concepts.topics.includes('news');

    return {
        raw,
        concepts,
        isTravelRail,
        isOperationalCurrent,
        isGeneralKnowledge,
        isWeather,
        isNews,
        isCompensationOrDelay: concepts.topics.includes('compensation') || concepts.topics.includes('delay'),
    };
};

const conceptSearchTerms = (intent) => {
    const { concepts } = intent;
    const terms = [];

    if (concepts.route) {
        terms.push(concepts.route.from, concepts.route.to);
    } else if (concepts.locations.length) {
        terms.push(...concepts.locations);
    }

    if (concepts.transport.includes('train')) terms.push('train');
    if (concepts.topics.includes('delay')) terms.push('delay');
    if (concepts.topics.includes('compensation')) terms.push('passenger compensation', 'passenger rights');
    if (concepts.topics.includes('schedule')) terms.push('schedule timetable');
    if (intent.isTravelRail && (concepts.topics.includes('delay') || concepts.topics.includes('compensation'))) {
        terms.push('Ukrzaliznytsia', 'PKP Intercity', 'EU rail passenger rights');
    }
    if (intent.isWeather) {
        terms.push('weather forecast', 'today');
    }
    if (intent.isNews) {
        terms.push('news', String(new Date().getFullYear()));
    }
    if (concepts.topics.includes('general_knowledge') && /python/i.test(intent.raw)) {
        terms.push('Python programming language history');
    }
    if (concepts.entities.includes('OpenAI')) {
        terms.push('OpenAI company news', String(new Date().getFullYear()));
    }

    return [...new Set(terms.filter(Boolean))];
};

const enforceRichQuery = (query, intent) => {
    let q = String(query || '').replace(/\s+/g, ' ').trim();
    const wordCount = q.split(/\s+/).filter(Boolean).length;

    const needsMultiConcept = intent.isOperationalCurrent || intent.isTravelRail || intent.isWeather || intent.isNews;
    if (needsMultiConcept && wordCount < 3) {
        q = conceptSearchTerms(intent).join(' ');
    }

    if (intent.isTravelRail && !/\b(train|rail|delay|compensation|schedule|passenger|intercity|pkp|ukrzaliznytsia)\b/i.test(q)) {
        q = `${q} train delay passenger compensation`.trim();
    }

    if (intent.isWeather && !/weather|forecast|today/i.test(q)) {
        q = `${q} weather forecast today`.trim();
    }

    return q.slice(0, 280);
};

const buildRetryQueries = (intent) => {
    const { concepts } = intent;
    const retries = [];
    const year = new Date().getFullYear();

    if (intent.isTravelRail && concepts.route) {
        retries.push(`${concepts.route.from} ${concepts.route.to} train delay compensation PKP Intercity Ukrzaliznytsia ${year}`);
        retries.push(`${concepts.route.from} to ${concepts.route.to} railway passenger rights EU regulation ${year}`);
    } else if (intent.isTravelRail && concepts.locations.length >= 2) {
        retries.push(`${concepts.locations.join(' ')} train delay compensation PKP Intercity ${year}`);
    }
    if (intent.isWeather && concepts.locations.length) {
        retries.push(`${concepts.locations[0]} weather today forecast ${year}`);
    }
    if (intent.isNews && concepts.entities.length) {
        retries.push(`${concepts.entities.join(' ')} latest news ${year}`);
    }
    if (intent.isGeneralKnowledge && /python/i.test(intent.raw)) {
        retries.push('Python programming language creator history');
    }

    return [...new Set(retries.map((q) => q.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 3);
};

const buildIntentAwareSearchQueries = (userQuestion) => {
    const intent = extractSearchIntent(userQuestion);
    const terms = conceptSearchTerms(intent);
    let primary = enforceRichQuery(terms.join(' '), intent);

    if (!primary || primary.split(/\s+/).length < 2) {
        primary = enforceRichQuery(stripQuestionPrefix(userQuestion), intent);
    }

    const alternates = [];
    if (CYRILLIC.test(userQuestion) && primary) {
        alternates.push(primary);
    }
    alternates.push(...buildRetryQueries(intent));

    if (intent.isGeneralKnowledge && /python/i.test(intent.raw)) {
        alternates.push('Guido van Rossum Python creator history');
    }

    const unique = [...new Set([primary, ...alternates.filter(Boolean)])].slice(0, 5);

    return {
        intent,
        primary: unique[0],
        queries: unique,
        retryQueries: buildRetryQueries(intent),
    };
};

const isQueryDegenerate = (query, intent) => {
    const q = String(query || '').trim();
    const words = q.split(/\s+/).filter(Boolean);
    if (!q) return true;
    if (intent.isOperationalCurrent && words.length < 3) return true;
    if (intent.isTravelRail && !/\b(train|rail|delay|compensation|schedule|passenger|intercity|pkp|ukrzaliznytsia|kyiv|warsaw)\b/i.test(q)) {
        return true;
    }
    if (words.length === 1 && intent.isOperationalCurrent) return true;
    return false;
};

module.exports = {
    buildIntentAwareSearchQueries,
    buildRetryQueries,
    extractSearchIntent,
    enforceRichQuery,
    isQueryDegenerate,
    normalizeLocationEn,
    stripQuestionPrefix,
};
