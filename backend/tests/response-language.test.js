const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildLanguageInstructionBlock,
    detectLanguageFromText,
    parseExplicitResponseLanguage,
    resolveResponseLanguage,
} = require('../src/services/responseLanguage');

test('detects English on programming-language prompts without switching to Spanish', () => {
    const sample = 'Teach me a Python languages I need understand him syntax';
    const detected = detectLanguageFromText(sample);
    assert.equal(detected.code, 'en');
    assert.match(buildLanguageInstructionBlock(detected), /English \(en\)/);
});

test('detects Ukrainian, Russian, and Spanish user messages', () => {
    assert.equal(detectLanguageFromText('Поясни синтаксис Python.').code, 'uk');
    assert.equal(detectLanguageFromText('Объясни синтаксис Python.').code, 'ru');
    assert.equal(detectLanguageFromText('Explica la sintaxis de Python.').code, 'es');
});

test('explicit language requests override auto detection', () => {
    assert.equal(parseExplicitResponseLanguage('Explain Python syntax in German.').code, 'de');
    const resolved = resolveResponseLanguage({
        latestUserText: 'Explain Python syntax in German.',
        preference: 'auto',
    });
    assert.equal(resolved.code, 'de');
    assert.equal(resolved.source, 'explicit');
});

test('chat preference overrides auto detection when set', () => {
    const resolved = resolveResponseLanguage({
        latestUserText: 'Hola, ¿qué tal?',
        preference: 'english',
    });
    assert.equal(resolved.code, 'en');
    assert.equal(resolved.source, 'preference');
});

test('latest user message wins over Spanish assistant history', () => {
    const resolved = resolveResponseLanguage({
        latestUserText: 'Explain Python syntax.',
        priorMessages: [
            { role: 'assistant', content: 'Claro, aquí tienes una explicación en español.' },
            { role: 'user', content: 'Explica la sintaxis de Python.' },
        ],
    });
    assert.equal(resolved.code, 'en');
});

test('language policy mentions history must not override latest user message', () => {
    const block = buildLanguageInstructionBlock({ code: 'en', label: 'English', source: 'auto' });
    assert.match(block, /previous conversation history/i);
    assert.match(block, /programming language/i);
});
