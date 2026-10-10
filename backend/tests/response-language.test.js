const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildLanguageInstructionBlock,
    detectLanguageFromText,
    parseExplicitResponseLanguage,
    resolveResponseLanguage,
    scoreCyrillicLanguage,
    stripTextForLanguageDetection,
} = require('../src/services/responseLanguage');

test('Test 1: Russian scary story prompt resolves to Russian', () => {
    const sample = 'Расскажи мне страшную историю';
    const resolved = resolveResponseLanguage({ latestUserText: sample, preference: 'auto' });
    assert.equal(resolved.code, 'ru');
    assert.match(buildLanguageInstructionBlock(resolved), /Russian \(ru\)/);
});

test('Test 2: Ukrainian scary story prompt resolves to Ukrainian', () => {
    const sample = 'Розкажи мені страшну історію';
    const resolved = resolveResponseLanguage({ latestUserText: sample, preference: 'auto' });
    assert.equal(resolved.code, 'uk');
});

test('Test 3: English scary story prompt resolves to English', () => {
    const resolved = resolveResponseLanguage({ latestUserText: 'Tell me a scary story', preference: 'auto' });
    assert.equal(resolved.code, 'en');
});

test('Test 4: Polish scary story prompt resolves to Polish', () => {
    const resolved = resolveResponseLanguage({ latestUserText: 'Opowiedz mi straszną historię', preference: 'auto' });
    assert.equal(resolved.code, 'pl');
});

test('Test 5: explicit English override inside Russian message', () => {
    const resolved = resolveResponseLanguage({
        latestUserText: 'Расскажи мне историю, но ответь на английском',
        preference: 'auto',
    });
    assert.equal(resolved.code, 'en');
    assert.equal(resolved.source, 'explicit');
});

test('Test 6: model switch keeps same resolved language from latest user message', () => {
    const prior = [
        { role: 'assistant', content: 'Ось страшна історія українською.' },
        { role: 'user', content: 'Расскажи мне страшную историю на ночь жуткую' },
    ];
    const resolved = resolveResponseLanguage({ latestUserText: prior[1].content, priorMessages: prior, preference: 'auto' });
    assert.equal(resolved.code, 'ru');
});

test('Test 7: Russian question with Python code block stays Russian for explanation', () => {
    const sample = `Объясни этот код:\n\`\`\`python\nprint("hello")\n\`\`\``;
    const stripped = stripTextForLanguageDetection(sample);
    assert.doesNotMatch(stripped, /print\("hello"\)/);
    const resolved = resolveResponseLanguage({ latestUserText: sample, preference: 'auto' });
    assert.equal(resolved.code, 'ru');
});

test('Test 8: ambiguous short message uses saved preference', () => {
    const resolved = resolveResponseLanguage({
        latestUserText: 'Ok',
        preference: 'ukrainian',
        priorMessages: [],
    });
    assert.equal(resolved.code, 'uk');
    assert.equal(resolved.source, 'preference');
});

test('detects English on programming-language prompts without switching to Spanish', () => {
    const sample = 'Teach me a Python languages I need understand him syntax';
    const detected = detectLanguageFromText(sample);
    assert.equal(detected.code, 'en');
});

test('detects Ukrainian and Russian distinct function words', () => {
    assert.equal(detectLanguageFromText('Поясни синтаксис Python.').code, 'uk');
    assert.equal(detectLanguageFromText('Объясни синтаксис Python.').code, 'ru');
    const scores = scoreCyrillicLanguage('Расскажи мне страшную историю на ночь жуткую');
    assert.ok(scores.ru > scores.uk);
});

test('explicit language requests override auto detection', () => {
    assert.equal(parseExplicitResponseLanguage('Explain Python syntax in German.').code, 'de');
});

test('confident message language wins over english preference', () => {
    const resolved = resolveResponseLanguage({
        latestUserText: 'Explica la sintaxis de Python.',
        preference: 'english',
    });
    assert.equal(resolved.code, 'es');
});

test('language policy mentions history must not override latest user message', () => {
    const block = buildLanguageInstructionBlock({ code: 'en', label: 'English', source: 'auto' });
    assert.match(block, /previous conversation history/i);
    assert.match(block, /programming language/i);
});

test('Test 8: Привет! Как дела? resolves to Russian', () => {
    assert.equal(resolveResponseLanguage({ latestUserText: 'Привет! Как дела?', preference: 'auto' }).code, 'ru');
});

test('Test 9: Привіт! Як справи? resolves to Ukrainian', () => {
    assert.equal(resolveResponseLanguage({ latestUserText: 'Привіт! Як справи?', preference: 'auto' }).code, 'uk');
});

test('Test 4/5: Polish and Russian Python prompts', () => {
    assert.equal(resolveResponseLanguage({ latestUserText: 'Напиши мне код на Python', preference: 'auto' }).code, 'ru');
    assert.equal(resolveResponseLanguage({ latestUserText: 'Напиши мені код на Python', preference: 'auto' }).code, 'uk');
});

test('Test 1 exact reproduction string', () => {
    const msg = 'Расскажи мне страшную историю на ночь жуткую';
    const resolved = resolveResponseLanguage({ latestUserText: msg, preference: 'auto', profileLanguage: 'ukrainian' });
    assert.equal(resolved.code, 'ru');
});
