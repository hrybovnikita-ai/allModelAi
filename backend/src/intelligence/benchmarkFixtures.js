const DATASET_VERSION = '2026-03-29.1';

const DETERMINISTIC_SUITES = {
    mathematics: {
        label: 'Mathematics (deterministic)',
        cases: [
            { id: 'math-add', type: 'numeric_tolerance', prompt: '2+2', expected: 4, tolerance: 0 },
            { id: 'math-sqrt', type: 'numeric_tolerance', prompt: 'sqrt(144)', expected: 12, tolerance: 0.001 },
        ],
    },
    structured_output: {
        label: 'Structured JSON (schema)',
        cases: [
            {
                id: 'json-user',
                type: 'json_schema',
                sampleOutput: '{"name":"Ada","role":"engineer"}',
                schema: {
                    type: 'object',
                    required: ['name', 'role'],
                    properties: { name: { type: 'string' }, role: { type: 'string' } },
                },
            },
        ],
    },
    javascript: {
        label: 'JavaScript (unit test fixture)',
        cases: [
            {
                id: 'js-sum',
                type: 'js_unit',
                code: 'function sum(a,b){return a+b;}',
                tests: [{ call: 'sum(2,3)', expected: 5 }],
            },
        ],
    },
};

function evaluateDeterministicCase(testCase, modelOutput) {
    const started = Date.now();
    if (testCase.type === 'numeric_tolerance') {
        const num = Number(String(modelOutput ?? testCase.expected).replace(/[^\d.-]/g, ''));
        const ok = Number.isFinite(num) && Math.abs(num - testCase.expected) <= (testCase.tolerance ?? 0);
        return {
            outcome: ok ? 'pass' : 'fail',
            score: ok ? 1 : 0,
            details: { expected: testCase.expected, parsed: num },
            latencyMs: Date.now() - started,
        };
    }
    if (testCase.type === 'json_schema') {
        const raw = modelOutput ?? testCase.sampleOutput;
        try {
            const parsed = JSON.parse(raw);
            const ok = parsed && typeof parsed.name === 'string' && typeof parsed.role === 'string';
            return {
                outcome: ok ? 'pass' : 'fail',
                score: ok ? 1 : 0,
                details: { parsed },
                latencyMs: Date.now() - started,
            };
        } catch (error) {
            return {
                outcome: 'fail',
                score: 0,
                details: { error: error.message },
                latencyMs: Date.now() - started,
            };
        }
    }
    if (testCase.type === 'js_unit') {
        try {
            // eslint-disable-next-line no-new-func
            const fn = new Function(`${testCase.code}; return { ${testCase.tests.map((t, i) => `t${i}: ${t.call}`).join(', ')} };`);
            const results = fn();
            const ok = testCase.tests.every((t, i) => results[`t${i}`] === t.expected);
            return {
                outcome: ok ? 'pass' : 'fail',
                score: ok ? 1 : 0,
                details: { results },
                latencyMs: Date.now() - started,
            };
        } catch (error) {
            return {
                outcome: 'error',
                score: 0,
                details: { error: error.message },
                latencyMs: Date.now() - started,
            };
        }
    }
    return {
        outcome: 'skipped',
        score: null,
        details: { reason: 'Unknown case type' },
        latencyMs: Date.now() - started,
    };
}

module.exports = {
    DATASET_VERSION,
    DETERMINISTIC_SUITES,
    evaluateDeterministicCase,
};
