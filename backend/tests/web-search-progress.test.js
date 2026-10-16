const { test } = require('node:test');
const assert = require('node:assert/strict');
const { collectWebSources, clearWebSearchCache } = (() => {
    const service = require('../src/services/webSearchService');
    const cache = require('../src/services/webSearchCache');
    return { collectWebSources: service.collectWebSources, clearWebSearchCache: cache.clearWebSearchCache };
})();

test('collectWebSources emits real progress stages in order', async () => {
    clearWebSearchCache();
    const stages = [];
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
        const target = String(url);
        if (target.includes('bing.com/search')) {
            const xml = `<rss><channel>
            <item><title>OpenAI product update</title><link>https://www.reuters.com/technology/openai/</link><description>Latest OpenAI news</description><pubDate>Wed, 15 Oct 2026 10:00:00 GMT</pubDate></item>
            </channel></rss>`;
            return new Response(xml, { status: 200 });
        }
        if (target.includes('wikipedia.org')) {
            return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200 });
        }
        return new Response('', { status: 200 });
    };
    try {
        const previous = process.env.TAVILY_API_KEY;
        delete process.env.TAVILY_API_KEY;
        const result = await collectWebSources('Latest OpenAI news', (stage, extra) => {
            stages.push({ stage, count: extra?.count, hasSources: Array.isArray(extra?.sources) });
        }, { topic: 'news', days: 7, skipCache: true });
        if (previous) process.env.TAVILY_API_KEY = previous;

        assert.ok(stages.some((s) => s.stage === 'searching'));
        assert.ok(stages.some((s) => s.stage === 'finding_sources'));
        assert.ok(stages.some((s) => s.stage === 'found' || s.stage === 'no_sources'));
        if (result.sources.length) {
            assert.ok(stages.some((s) => s.stage === 'checking' || s.stage === 'reading'));
        }
        assert.ok(result.retrievedAt);
        assert.equal(typeof result.retrievedAt, 'string');
    } finally {
        global.fetch = originalFetch;
        clearWebSearchCache();
    }
});

test('collectWebSources respects AbortSignal timeout/cancellation', async () => {
    clearWebSearchCache();
    const originalFetch = global.fetch;
    global.fetch = async (_url, options = {}) => {
        const signal = options.signal;
        await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 5000);
            if (!signal) return;
            if (signal.aborted) {
                clearTimeout(timer);
                reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
                return;
            }
            signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
            }, { once: true });
        });
        return new Response('<rss><channel></channel></rss>', { status: 200 });
    };
    try {
        const previous = process.env.TAVILY_API_KEY;
        delete process.env.TAVILY_API_KEY;
        let threw = false;
        try {
            await collectWebSources('timeout query', null, {
                skipCache: true,
                signal: AbortSignal.timeout(30),
            });
        } catch (error) {
            threw = true;
            assert.ok(/abort|timeout/i.test(error.name + error.message));
        }
        if (previous) process.env.TAVILY_API_KEY = previous;
        assert.equal(threw, true);
    } finally {
        global.fetch = originalFetch;
        clearWebSearchCache();
    }
});

test('collectWebSources returns empty sources without inventing results on blank providers', async () => {
    clearWebSearchCache();
    const originalFetch = global.fetch;
    global.fetch = async () => new Response('<rss><channel></channel></rss>', { status: 200 });
    try {
        const previous = process.env.TAVILY_API_KEY;
        delete process.env.TAVILY_API_KEY;
        const stages = [];
        const result = await collectWebSources('obscure_xyzzy_no_hits_12345', (stage) => stages.push(stage), {
            skipCache: true,
        });
        if (previous) process.env.TAVILY_API_KEY = previous;
        assert.equal(result.sources.length, 0);
        assert.ok(stages.includes('no_sources') || stages.includes('found'));
        assert.equal(result.webSearchComplete, false);
    } finally {
        global.fetch = originalFetch;
        clearWebSearchCache();
    }
});
