const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeSearchResult,
    rankDeepResearchSources,
} = require('../src/services/deepResearch/sourcePipeline');

describe('Deep Research regression: 40 search hits must survive ranking', () => {
    test('Tavily-shaped results (content field, not excerpt) produce accepted sources', () => {
        const userQuestion = 'Найти мне книги по изучению Python';
        const plan = {
            objective: 'Find books to learn Python',
            queries: ['best Python books', 'Python learning books O\'Reilly', 'Python tutorial books'],
        };

        const rawResults = Array.from({ length: 40 }, (_, index) => ({
            title: `Python learning resource ${index}`,
            url: `https://publisher-example-${index}.com/python/book-${index}`,
            content: 'A recommended Python book for studying programming and software development.',
            score: 0.75 + (index % 5) * 0.03,
        }));

        const { ranked, diagnostics } = rankDeepResearchSources({
            userQuestion,
            rawSources: rawResults,
            plan,
            limit: 14,
            minAccepted: 4,
        });

        assert.ok(rawResults.length > 0);
        assert.equal(diagnostics.normalizedCount, 40);
        assert.ok(diagnostics.validUrlCount > 0);
        assert.ok(ranked.length > 0, 'expected accepted sources after ranking');
        assert.ok(diagnostics.acceptedCount > 0);
        assert.ok(ranked.every((s) => s.excerpt && s.url.startsWith('https://')));
    });

    test('fallback Bing RSS shape (link + description) normalizes correctly', () => {
        const normalized = normalizeSearchResult({
            title: 'Fluent Python',
            link: 'https://www.oreilly.com/library/view/fluent-python/',
            description: 'Clear, concise introduction to Python for working programmers.',
        }, 'bing');

        assert.equal(normalized.url, 'https://www.oreilly.com/library/view/fluent-python/');
        assert.match(normalized.excerpt, /Python/i);

        const { ranked } = rankDeepResearchSources({
            userQuestion: 'Найти мне книги по изучению Python',
            rawSources: [normalized],
            plan: { objective: 'Python books', queries: ['fluent python book'] },
            limit: 5,
            minAccepted: 1,
        });
        assert.equal(ranked.length, 1);
    });
});
