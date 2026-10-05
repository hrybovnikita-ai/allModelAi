const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildSearchQuery,
    buildIntentAwareSearchQueries,
    buildAlternateSearchQueries,
    rankSources,
    collectWebSources,
    isTavilyConfigured,
} = require('../src/services/webSearchService');
const { isClearlyUnrelated, isGeographyEncyclopediaNoise } = require('../src/services/webSearchRelevance');
const { extractSearchIntent } = require('../src/services/webSearchQueryBuilder');

const KYIV_WARSAW = 'Сколько стоит задержка поезда Киев -> Варшава Центральная';
const WARSAW_WEATHER = 'Какая погода сегодня в Варшаве?';
const PYTHON_INVENT = 'Who invented Python?';
const OPENAI_NEWS = 'Latest OpenAI news';

const WIZARDS = {
    title: 'Washington Wizards rally past Brooklyn Nets',
    url: 'https://www.nytimes.com/athletic/nba/wizards-nets',
    excerpt: 'NBA basketball playoffs Washington Wizards score',
    domain: 'nytimes.com',
};

const RAIL = {
    title: 'Passenger rights for delayed international trains Kyiv Warsaw',
    url: 'https://www.intercity.pl/en/passenger-rights',
    excerpt: 'PKP Intercity delay compensation EU regulation train Warsaw Kyiv',
    domain: 'intercity.pl',
};

const KYIV_WIKI = {
    title: 'Kyiv - Wikipedia',
    url: 'https://en.wikipedia.org/wiki/Kyiv',
    excerpt: 'Kyiv is the capital and largest city of Ukraine, on the Dnieper River.',
    domain: 'en.wikipedia.org',
};

const BRITANNICA_KYIV = {
    title: 'Kyiv | Points Of Interest, Map, Facts, & History | Britannica',
    url: 'https://www.britannica.com/place/Kyiv',
    excerpt: 'Geography and history of Kyiv as a cultural capital.',
    domain: 'britannica.com',
};

const PYTHON_WIKI = {
    title: 'Python (programming language) - Wikipedia',
    url: 'https://en.wikipedia.org/wiki/Python_(programming_language)',
    excerpt: 'Python was created by Guido van Rossum and first released in 1991.',
    domain: 'en.wikipedia.org',
};

const OPENAI_NEWS_SRC = {
    title: 'OpenAI announces new model release',
    url: 'https://www.reuters.com/technology/openai/',
    excerpt: 'OpenAI latest product news and company update.',
    domain: 'reuters.com',
};

test('A: Kyiv Warsaw train query preserves route and delay intent (not only Kyiv)', () => {
    const query = buildSearchQuery(KYIV_WARSAW);
    const words = query.split(/\s+/);
    assert.ok(words.length >= 4, `query too short: ${query}`);
    assert.match(query, /Kyiv/i);
    assert.match(query, /Warsaw/i);
    assert.match(query, /train|delay|compensation|passenger/i);
    assert.notEqual(query.trim().toLowerCase(), 'kyiv');
    const intent = extractSearchIntent(KYIV_WARSAW);
    assert.equal(intent.isTravelRail, true);
    assert.match(intent.concepts.route.to, /Warsaw/i);
});

test('B: Warsaw weather query retains weather and today intent', () => {
    const bundle = buildIntentAwareSearchQueries(WARSAW_WEATHER);
    assert.match(bundle.primary, /Warsaw/i);
    assert.match(bundle.primary, /weather|forecast|today/i);
    assert.equal(extractSearchIntent(WARSAW_WEATHER).isWeather, true);
});

test('C: general knowledge allows Wikipedia for Python inventor question', () => {
    const intent = extractSearchIntent(PYTHON_INVENT);
    assert.equal(intent.isGeneralKnowledge, true);
    const ranked = rankSources(PYTHON_INVENT, [PYTHON_WIKI, WIZARDS], 4);
    assert.ok(ranked.some((s) => /wikipedia\.org/i.test(s.domain)));
    assert.equal(isGeographyEncyclopediaNoise(PYTHON_WIKI, intent), false);
});

test('D: latest OpenAI news prefers news sources over encyclopedia', () => {
    const ranked = rankSources(OPENAI_NEWS, [PYTHON_WIKI, OPENAI_NEWS_SRC], 4);
    assert.ok(ranked.length >= 1);
    assert.equal(ranked[0].domain.includes('reuters.com'), true);
});

test('E: geography encyclopedia pages down-ranked for train delay questions', () => {
    assert.equal(isClearlyUnrelated(KYIV_WARSAW, KYIV_WIKI), true);
    assert.equal(isClearlyUnrelated(KYIV_WARSAW, BRITANNICA_KYIV), true);
    const ranked = rankSources(KYIV_WARSAW, [KYIV_WIKI, BRITANNICA_KYIV, RAIL], 6);
    assert.equal(ranked.some((s) => /wikipedia|britannica/i.test(s.domain)), false);
    assert.ok(ranked.some((s) => /intercity|pkp|delay|passenger/i.test(`${s.title} ${s.excerpt}`)));
});

test('rankSources rejects Washington Wizards for Kyiv Warsaw train question', () => {
    const ranked = rankSources(KYIV_WARSAW, [WIZARDS, RAIL], 6);
    assert.equal(ranked.some((s) => /Wizards|NBA/i.test(s.title)), false);
});

test('collectWebSources filters encyclopedia-only noise for train query', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
        const target = String(url);
        if (target.includes('bing.com/search')) {
            const xml = `<rss><channel>
            <item><title>${KYIV_WIKI.title}</title><link>${KYIV_WIKI.url}</link><description>${KYIV_WIKI.excerpt}</description></item>
            <item><title>${RAIL.title}</title><link>${RAIL.url}</link><description>${RAIL.excerpt}</description></item>
            </channel></rss>`;
            return new Response(xml, { status: 200 });
        }
        if (target.includes('wikipedia.org')) {
            return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200 });
        }
        return new Response('', { status: 200 });
    };
    try {
        const result = await collectWebSources(KYIV_WARSAW);
        assert.equal(result.sources.some((s) => /wikipedia|britannica/i.test(s.domain)), false);
        if (result.sources.length) {
            assert.match(result.sources[0].url, /intercity|pkp|rail|passenger/i);
        }
    } finally {
        global.fetch = originalFetch;
    }
});

test('tavily missing does not throw from collectWebSources public fallback', async () => {
    const previous = process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_API_KEY;
    assert.equal(isTavilyConfigured(), false);
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
        const target = String(url);
        if (target.includes('bing.com')) {
            return new Response('<rss><channel></channel></rss>', { status: 200 });
        }
        if (target.includes('wikipedia.org')) {
            return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200 });
        }
        return new Response('', { status: 200 });
    };
    try {
        const result = await collectWebSources('What is Django web framework?');
        assert.equal(result.webSearchAvailable, true);
        assert.ok(Array.isArray(result.sources));
    } finally {
        global.fetch = originalFetch;
        if (previous) process.env.TAVILY_API_KEY = previous;
    }
});

test('alternate queries are generated dynamically from intent', () => {
    const queries = buildAlternateSearchQueries(KYIV_WARSAW);
    assert.ok(queries.length >= 2);
    assert.ok(queries.every((q) => q.split(/\s+/).length >= 3));
});
