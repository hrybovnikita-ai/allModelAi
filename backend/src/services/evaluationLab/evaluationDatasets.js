/**
 * Built-in evaluation prompts. Not private user data.
 * Deterministic checks are labeled separately from AI-judged scoring.
 */

const EVAL_DATASETS = Object.freeze([
    {
        id: 'coding',
        name: 'Coding',
        items: [
            {
                id: 'coding-fizzbuzz',
                prompt: 'Write a Python function fizzbuzz(n) that returns the FizzBuzz list for 1..n.',
                deterministic: {
                    mustInclude: ['def fizzbuzz', 'Fizz', 'Buzz'],
                },
            },
            {
                id: 'coding-binary-search',
                prompt: 'Implement iterative binary search in JavaScript. Return the index or -1.',
                deterministic: {
                    mustInclude: ['function', 'mid'],
                },
            },
        ],
    },
    {
        id: 'mathematics',
        name: 'Mathematics',
        items: [
            {
                id: 'math-area',
                prompt: 'What is the area of a circle with radius 3? Give the exact expression in terms of pi.',
                deterministic: {
                    mustMatch: /9\s*\*?\s*pi|9π|pi\s*\*\s*9/i,
                },
            },
        ],
    },
    {
        id: 'reasoning',
        name: 'Reasoning',
        items: [
            {
                id: 'reason-coins',
                prompt: 'A bat and a ball cost $1.10 in total. The bat costs $1 more than the ball. How much does the ball cost?',
                deterministic: {
                    mustMatch: /0\.05|5\s*cents|\$0\.05/i,
                },
            },
        ],
    },
    {
        id: 'summarization',
        name: 'Summarization',
        items: [
            {
                id: 'sum-short',
                prompt: 'Summarize in one sentence: Photosynthesis converts light energy into chemical energy in plants, producing glucose and oxygen.',
                aiJudge: true,
                judgeRubric: 'Check factual coverage of light energy, glucose, and oxygen. Label as AI-judged, not verified accuracy.',
            },
        ],
    },
    {
        id: 'document_understanding',
        name: 'Document understanding',
        items: [
            {
                id: 'doc-extract',
                prompt: 'From this note: "Invoice #441 due 2026-11-01 for $250 to Acme" extract invoice id, due date, amount, vendor as JSON.',
                deterministic: {
                    mustInclude: ['441', '2026-11-01', '250', 'Acme'],
                },
            },
        ],
    },
]);

function listDatasets() {
    return EVAL_DATASETS.map(({ id, name, items }) => ({
        id,
        name,
        itemCount: items.length,
    }));
}

function getDataset(id) {
    return EVAL_DATASETS.find((set) => set.id === id) || null;
}

function scoreDeterministic(item, answer) {
    const text = String(answer || '');
    const checks = item.deterministic || {};
    const details = [];
    let passed = true;
    if (Array.isArray(checks.mustInclude)) {
        for (const needle of checks.mustInclude) {
            const ok = text.includes(needle);
            details.push({ type: 'mustInclude', needle, ok });
            if (!ok) passed = false;
        }
    }
    if (checks.mustMatch) {
        const ok = checks.mustMatch.test(text);
        details.push({ type: 'mustMatch', ok });
        if (!ok) passed = false;
    }
    return {
        method: 'deterministic',
        passed,
        score: passed ? 1 : 0,
        details,
        objective: true,
    };
}

module.exports = {
    EVAL_DATASETS,
    listDatasets,
    getDataset,
    scoreDeterministic,
};
