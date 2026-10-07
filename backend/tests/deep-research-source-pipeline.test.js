const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeRawSource,
    rankDeepResearchSources,
    buildResearchMatchContext,
} = require('../src/services/deepResearch/sourcePipeline');

describe('Deep Research source pipeline', () => {
    test('normalizes provider field aliases', () => {
        const source = normalizeRawSource({
            link: 'https://cursor.com/docs',
            name: 'Cursor Docs',
            snippet: 'AI code editor documentation',
        }, 'tavily');
        assert.equal(source.url, 'https://cursor.com/docs');
        assert.equal(source.title, 'Cursor Docs');
        assert.match(source.excerpt, /documentation/i);
        assert.equal(source.provider, 'tavily');
    });

    test('accepts English AI coding sources for Russian user question', () => {
        const userQuestion = 'Покажи мне лучших ИИ помощников которые очень хорошо разбираются в коде';
        const plan = {
            objective: 'Find top AI coding assistants',
            queries: [
                'best AI coding assistants 2026',
                'GitHub Copilot vs Cursor comparison',
            ],
        };
        const rawSources = [
            {
                title: 'GitHub Copilot · Your AI pair programmer',
                url: 'https://github.com/features/copilot',
                excerpt: 'AI coding assistant for developers',
                provider: 'tavily',
                score: 0.91,
            },
            {
                title: 'Cursor – The AI Code Editor',
                url: 'https://cursor.com',
                excerpt: 'Built for programming with AI pair programming',
                provider: 'tavily',
                score: 0.88,
            },
            {
                title: 'Best AI Coding Tools in 2026',
                url: 'https://www.theverge.com/ai-coding-tools',
                excerpt: 'Comparison of AI developer assistants',
                provider: 'tavily',
                score: 0.82,
            },
        ];

        const context = buildResearchMatchContext(userQuestion, plan);
        assert.match(context, /AI coding assistant/i);

        const { ranked, diagnostics } = rankDeepResearchSources({
            userQuestion,
            rawSources,
            plan,
            limit: 10,
            minAccepted: 2,
        });

        assert.ok(diagnostics.rawCount >= 3);
        assert.ok(ranked.length >= 2, `expected accepted sources, got ${ranked.length}, rejected=${diagnostics.rejectedCount}`);
        assert.ok(ranked.every((s) => s.url.startsWith('https://')));
    });

    test('deduplicates identical URLs', () => {
        const { ranked } = rankDeepResearchSources({
            userQuestion: 'best python books',
            rawSources: [
                { title: 'A', url: 'https://example.com/book', excerpt: 'Python book review', provider: 'tavily' },
                { title: 'A duplicate', url: 'https://example.com/book', excerpt: 'dup', provider: 'public' },
            ],
            plan: { objective: 'python books', queries: ['python books senior'] },
            limit: 5,
            minAccepted: 1,
        });
        assert.equal(ranked.length, 1);
    });
});
