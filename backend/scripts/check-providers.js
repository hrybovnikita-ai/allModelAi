const path = require('node:path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

// Read-only checks: never print credentials, response bodies or request URLs.
const env = process.env;
const checks = [
    ['OpenRouter', env.OPENROUTER_API_KEY || env.API_KEY, 'https://openrouter.ai/api/v1/key'],
    ['OpenAI', env.OPENAI_API_KEY || env.OPEN_AI_API_KEY, 'https://api.openai.com/v1/models'],
    ['xAI', env.XAI_API_KEY || env.GROK_API_KEY, 'https://api.x.ai/v1/models'],
    ['Anthropic', env.CLAUDE_API_KEY, 'https://api.anthropic.com/v1/models', 'anthropic'],
    ['Gemini', env.GEMINI_API_KEY, 'https://generativelanguage.googleapis.com/v1beta/models', 'gemini'],
    ['Mistral', env.MISTRAL_API_KEY, 'https://api.mistral.ai/v1/models'],
    ['Kimi', env.KIMI_API_KEY, (env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').trim().replace(/\/+$/, '') + '/models'],
    ['Cloudflare token', env.CLOUDFLARE_API_KEY || env.CLAUDEFLARE_API_KEY, 'https://api.cloudflare.com/client/v4/user/tokens/verify'],
];

async function check([name, key, url, type]) {
    if (!key?.trim()) return console.log(`${name}: not configured`);
    const headers = type === 'anthropic'
        ? { 'x-api-key': key.trim(), 'anthropic-version': '2023-06-01' }
        : type === 'gemini' ? { 'x-goog-api-key': key.trim() }
            : { Authorization: `Bearer ${key.trim()}` };
    try {
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
        const data = await response.json().catch(() => null);
        const ok = response.ok && data?.success !== false;
        console.log(`${name}: ${ok ? 'OK' : 'FAILED'} (HTTP ${response.status})`);
        if (!ok) process.exitCode = 1;
    } catch {
        console.log(`${name}: connection failed or timed out`);
        process.exitCode = 1;
    }
}

Promise.all(checks.map(check)).then(() => {
    console.log(`Cloudflare account: ${env.CLOUDFLARE_ACCOUNT_ID?.trim() ? 'configured' : 'missing (required for Workers AI)'}`);
    console.log('These checks do not generate content or verify generation quota/model access.');
});
