const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    cacheKey,
    getCached,
    setCached,
    clearWebSearchCache,
} = require('../src/services/webSearchCache');
const { mapSourcesForClient } = require('../src/services/webSourceCitations');

test('web search cache stores and returns within TTL', () => {
    clearWebSearchCache();
    const key = cacheKey({ q: 'latest openai news', days: 7, topic: 'news' });
    setCached(key, { sources: [{ title: 'A', url: 'https://example.com/a' }], webSearchComplete: true }, 60_000);
    const hit = getCached(key);
    assert.ok(hit);
    assert.equal(hit.sources.length, 1);
    clearWebSearchCache();
    assert.equal(getCached(key), null);
});

test('web search cache expires after TTL', async () => {
    clearWebSearchCache();
    const key = cacheKey({ q: 'expire-me' });
    setCached(key, { sources: [] }, 20);
    assert.ok(getCached(key));
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.equal(getCached(key), null);
    clearWebSearchCache();
});

test('mapSourcesForClient preserves publishedDate and retrievedAt separately', () => {
    const retrievedAt = '2026-10-16T12:00:00.000Z';
    const mapped = mapSourcesForClient([
        {
            citationId: 1,
            title: 'Breaking update',
            url: 'https://reuters.com/world/example',
            domain: 'reuters.com',
            excerpt: 'Confirmed details…',
            publishedDate: '2026-10-15',
        },
    ], { retrievedAt });
    assert.equal(mapped[0].publishedDate, '2026-10-15');
    assert.equal(mapped[0].retrievedAt, retrievedAt);
    assert.notEqual(mapped[0].publishedDate, mapped[0].retrievedAt);
});

test('mapSourcesForClient strips unsafe urls', () => {
    const mapped = mapSourcesForClient([
        { title: 'Bad', url: 'javascript:alert(1)', domain: 'evil' },
        { title: 'Good', url: 'https://example.com/ok', domain: 'example.com', published_date: '2026-01-01' },
    ]);
    assert.equal(mapped[0].url, '');
    assert.equal(mapped[1].url, 'https://example.com/ok');
    assert.equal(mapped[1].publishedDate, '2026-01-01');
});
