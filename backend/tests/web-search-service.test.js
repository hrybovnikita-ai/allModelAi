const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildSearchQuery,
    buildAlternateSearchQueries,
    rankSources,
    collectWebSources,
    isTavilyConfigured,
} = require('../src/services/webSearchService');
const { isClearlyUnrelated } = require('../src/services/webSearchRelevance');

const KYIV_WARSAW = 'Сколько стоит задержка поезда Киев -> Варшава Центральная';

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

test('buildSearchQuery preserves Kyiv Warsaw train delay topic', () => {
    const query = buildSearchQuery(KYIV_WARSAW);
    assert.match(query, /delay|compensation|PKP|Ukrzaliznytsia|train/i);
    assert.doesNotMatch(query, /Washington Wizards|NBA/i);
    assert.doesNotMatch(query, /price USD/i);
});

test('alternate queries include multilingual rail context', () => {
    const queries = buildAlternateSearchQueries(KYIV_WARSAW);
    assert.ok(queries.length >= 2);
    assert.ok(queries.some((q) => /Kyiv|Warsaw|PKP|Укрзал/i.test(q)));
});

test('rankSources rejects Washington Wizards for Kyiv Warsaw train question', () => {
    const ranked = rankSources(KYIV_WARSAW, [WIZARDS, RAIL], 6);
    assert.equal(ranked.some((s) => /Wizards|NBA/i.test(s.title)), false);
    assert.ok(ranked.some((s) => /intercity|PKP|delay|train/i.test(`${s.title} ${s.excerpt}`)));
});

test('isClearlyUnrelated flags NBA sources for rail queries', () => {
    assert.equal(isClearlyUnrelated(KYIV_WARSAW, WIZARDS), true);
    assert.equal(isClearlyUnrelated(KYIV_WARSAW, RAIL), false);
});

test('rankSources does not pad with unrelated results when only junk is available', () => {
    const ranked = rankSources(KYIV_WARSAW, [WIZARDS, {
        title: 'Google News — Sports headlines',
        url: 'https://news.google.com/articles/wizards',
        excerpt: 'Washington Wizards NBA',
        domain: 'news.google.com',
    }], 6);
    assert.equal(ranked.length, 0);
});

test('collectWebSources never returns fake Wizards results for Kyiv Warsaw query', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
        const target = String(url);
        if (target.includes('bing.com/search')) {
            const xml = `<rss><channel><item><title>${WIZARDS.title}</title><link>${WIZARDS.url}</link><description>${WIZARDS.excerpt}</description></item></channel></rss>`;
            return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/rss+xml' } });
        }
        if (target.includes('duckduckgo.com')) {
            return new Response('<html></html>', { status: 200 });
        }
        if (target.includes('wikipedia.org')) {
            return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200 });
        }
        return new Response('{}', { status: 404 });
    };
    try {
        const result = await collectWebSources(KYIV_WARSAW);
        assert.equal(result.webSearchPerformed, true);
        assert.equal(result.sources.some((s) => /Wizards|NBA/i.test(s.title)), false);
        assert.equal(result.webSearchComplete, result.sources.length > 0);
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
