'use strict';

const API_CONTRACTS = [
    { method: 'POST', path: '/api/auth/login', auth: false, success: [200] },
    { method: 'POST', path: '/api/chat', auth: true, success: [200], stream: true },
    { method: 'GET', path: '/api/status/models', auth: false, success: [200] },
    { method: 'GET', path: '/api/platform/vault', auth: true, admin: true, success: [200] },
    { method: 'POST', path: '/api/platform/export', auth: true, success: [200] },
    { method: 'GET', path: '/api/platform/github', auth: true, success: [200] },
    { method: 'POST', path: '/api/platform/webhooks/events', auth: true, admin: true, success: [202, 401] },
];

const AI_QUALITY_CASES = [
    { id: 'known-answer', prompt: 'What is 2+2?', expect: '4' },
    { id: 'language-en', prompt: 'Reply in English: hello', expectLanguage: 'en' },
    { id: 'python', prompt: 'Write a Python function add(a, b).', expectIncludes: 'def add' },
    { id: 'javascript', prompt: 'Write a JavaScript function add(a, b).', expectIncludes: 'function add' },
    { id: 'router-fallback', prompt: 'research query', expectRoute: 'gemini' },
];

function mockedReply(testCase) {
    if (testCase.id === 'known-answer') return '4';
    if (testCase.id === 'language-en') return 'hello';
    if (testCase.id === 'python') return 'def add(a, b):\n    return a + b\n';
    if (testCase.id === 'javascript') return 'function add(a, b) { return a + b; }\n';
    if (testCase.id === 'router-fallback') return 'gemini';
    return '';
}

function runMockedQualityLab() {
    const started = Date.now();
    const results = AI_QUALITY_CASES.map((testCase) => {
        const output = mockedReply(testCase);
        const passed = testCase.expect
            ? output.includes(testCase.expect)
            : testCase.expectIncludes
                ? output.includes(testCase.expectIncludes)
                : testCase.expectRoute
                    ? output === testCase.expectRoute
                    : Boolean(output);
        return { id: testCase.id, passed, latencyMs: 0, live: false };
    });
    return {
        mode: 'mocked',
        passed: results.filter((row) => row.passed).length,
        failed: results.filter((row) => !row.passed).length,
        averageLatencyMs: 0,
        elapsedMs: Date.now() - started,
        results,
        note: 'Mocked providers only. A mocked pass is not a live correctness guarantee.',
    };
}

const VISUAL_TARGETS = [
    { route: '/dashboard', viewports: [375, 768, 1440] },
    { route: '/chat', viewports: [375, 768, 1440] },
    { route: '/login', viewports: [375, 768, 1440] },
    { route: '/register', viewports: [375, 768, 1440] },
    { route: '/settings', viewports: [375, 768, 1440] },
    { route: '/billing', viewports: [375, 768, 1440] },
    { route: '/knowledge', viewports: [375, 768, 1440] },
    { route: '/platform', viewports: [375, 768, 1440] },
];

module.exports = {
    API_CONTRACTS,
    AI_QUALITY_CASES,
    VISUAL_TARGETS,
    runMockedQualityLab,
};
