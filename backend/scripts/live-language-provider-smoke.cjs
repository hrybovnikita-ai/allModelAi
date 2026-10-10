/**
 * Live multilingual smoke (minimal tokens). Loads .env locally; never prints secrets.
 * Run: node scripts/live-language-provider-smoke.cjs
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

const {
    buildChatLanguageContext,
    buildProviderSystemPrompt,
    augmentMessagesForProvider,
    providerPayloadIncludesLanguage,
} = require('../src/services/responseLanguagePolicy');
const { scoreCyrillicLanguage } = require('../src/services/responseLanguage');

const CASES = [
    { id: 'ru', prompt: 'Расскажи мне страшную историю на ночь жуткую', expect: 'ru' },
    { id: 'uk', prompt: 'Розкажи мені страшну історію на ніч', expect: 'uk' },
    { id: 'en', prompt: 'Tell me a scary bedtime story', expect: 'en' },
];

function classifyOutput(text, expect) {
    if (expect === 'en') {
        const cyrillic = (text.match(/[\p{Script=Cyrillic}]/gu) || []).length;
        return cyrillic < 8 ? 'en' : 'mixed';
    }
    const { ru, uk } = scoreCyrillicLanguage(text);
    if (ru > uk) return 'ru';
    if (uk > ru) return 'uk';
    return 'ambiguous';
}

async function callGemini(userMessage, ctx) {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) return { skipped: true };
    const systemPrompt = buildProviderSystemPrompt('You are AllModelAI.', ctx.policy);
    const messages = augmentMessagesForProvider([{ role: 'user', content: userMessage }], ctx.policy);
    const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: messages[0].content }] }],
            generationConfig: { maxOutputTokens: 100, temperature: 0.35 },
        }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        return { ok: false, status: response.status, message: data.error?.message || 'error' };
    }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    return {
        ok: true,
        text,
        instructionIncluded: providerPayloadIncludesLanguage(systemPrompt, ctx.policy),
    };
}

async function main() {
    const results = [];
    for (const item of CASES) {
        const ctx = buildChatLanguageContext({ latestUserText: item.prompt, preference: 'auto' });
        const detected = ctx.policy.language;
        const gemini = await callGemini(item.prompt, ctx);
        let outputLang = null;
        let pass = false;
        if (gemini.skipped) {
            results.push({ ...item, detected, live: 'skipped-no-key' });
            continue;
        }
        if (!gemini.ok) {
            results.push({ ...item, detected, live: 'fail-http', status: gemini.status });
            continue;
        }
        outputLang = classifyOutput(gemini.text, item.expect);
        pass = outputLang === item.expect || (item.expect === 'en' && outputLang === 'en');
        results.push({
            id: item.id,
            detected,
            expected: item.expect,
            outputLang,
            pass,
            instructionIncluded: gemini.instructionIncluded,
            previewLen: gemini.text.length,
        });
    }
    console.log(JSON.stringify({ liveProviderTests: results }, null, 2));
    const live = results.filter((r) => r.pass !== undefined);
    if (!live.length) {
        console.log('Live provider verification: NOT RUN (no GEMINI_API_KEY)');
        process.exit(0);
    }
    if (live.some((r) => r.pass === false)) process.exit(2);
}

main().catch((error) => {
    console.error('Live language smoke failed:', error.message);
    process.exit(1);
});
