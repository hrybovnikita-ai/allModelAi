const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    augmentMessagesForProvider,
    buildProviderSystemPrompt,
    buildChatLanguageContext,
    toPolicyRecord,
} = require('../src/services/responseLanguagePolicy');

const RU_STORY = 'Расскажи мне страшную историю на ночь жуткую';

test('Test 10/11: fallback payloads keep Russian system prompt and user tail', () => {
    const ctx = buildChatLanguageContext({ latestUserText: RU_STORY, preference: 'auto' });
    assert.equal(ctx.policy.language, 'ru');
    const system = buildProviderSystemPrompt('Base assistant prompt.', ctx.policy);
    assert.match(system, /Russian \(ru\)/i);
    assert.match(system, /natural Russian/i);
    assert.match(system, /MANDATORY RESPONSE LANGUAGE/i);
    const messages = augmentMessagesForProvider([{ role: 'user', content: RU_STORY }], ctx.policy);
    assert.match(messages[0].content, /reply entirely in Russian/i);
    assert.ok(messages[0].content.includes(RU_STORY));
});

test('Test 12: conversation language switch resolves from latest Russian turn', () => {
    const ctx = buildChatLanguageContext({
        latestUserText: 'Теперь расскажи мне историю на русском.',
        priorMessages: [
            { role: 'user', content: 'Привіт! Як справи?' },
            { role: 'assistant', content: 'Привіт! У мене все добре.' },
        ],
        preference: 'auto',
    });
    assert.equal(ctx.policy.language, 'ru');
});

test('Test 13/14: browser locale is not used — only message text', () => {
    const ru = buildChatLanguageContext({
        latestUserText: RU_STORY,
        preference: 'auto',
        profileLanguage: 'ukrainian',
    });
    assert.equal(ru.policy.language, 'ru');
    const uk = buildChatLanguageContext({
        latestUserText: 'Розкажи мені дуже страшну історію на ніч',
        preference: 'auto',
        profileLanguage: 'english',
    });
    assert.equal(uk.policy.language, 'uk');
});

test('Test 15: code block stripped for detection; provider tail still on user message', () => {
    const sample = 'Объясни код:\n```python\nprint("hello")\n```';
    const ctx = buildChatLanguageContext({ latestUserText: sample, preference: 'auto' });
    assert.equal(ctx.policy.language, 'ru');
    const messages = augmentMessagesForProvider([{ role: 'user', content: sample }], ctx.policy);
    assert.match(messages[0].content, /```python/);
    assert.match(messages[0].content, /print\("hello"\)/);
});

test('policy record shape for diagnostics', () => {
    const record = toPolicyRecord({ code: 'ru', label: 'Russian', source: 'auto', confidence: 'high' });
    assert.equal(record.language, 'ru');
    assert.equal(record.source, 'detected-user-message');
    assert.ok(record.confidence >= 0.9);
    assert.match(record.directive, /Russian/i);
});
