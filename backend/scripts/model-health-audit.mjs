#!/usr/bin/env node
/**
 * Discovers configured model variants and credential presence.
 * Live inference requires --live and billable provider keys (never prints secrets).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const variants = JSON.parse(readFileSync(join(root, 'src/data/modelVariants.json'), 'utf8'));

const KEY_CHECKS = [
    ['OPENAI_API_KEY', 'OpenAI'],
    ['OPENROUTER_API_KEY', 'OpenRouter'],
    ['ALLMODELAI_OPENROUTER_API_KEY', 'OpenRouter (AllModelAI)'],
    ['GEMINI_API_KEY', 'Gemini'],
    ['CLAUDE_API_KEY', 'Claude'],
    ['ANTHROPIC_API_KEY', 'Anthropic'],
    ['GROQ_API_KEY', 'Groq'],
    ['DEEPSEEK_API_KEY', 'DeepSeek'],
    ['MISTRAL_API_KEY', 'Mistral'],
    ['KIMI_API_KEY', 'Kimi'],
    ['CLOUDFLARE_ACCOUNT_ID', 'Cloudflare account'],
    ['CLOUDFLARE_API_KEY', 'Cloudflare API'],
    ['OLLAMA_API_KEY', 'Ollama Cloud'],
];

let totalVariants = 0;
for (const list of Object.values(variants)) totalVariants += list.length;

console.log('AllModelAI model health audit (discovery only)');
console.log(`Model families: ${Object.keys(variants).length}`);
console.log(`Variant rows: ${totalVariants}`);
console.log('\nCredential presence (not operational proof):');
for (const [env, label] of KEY_CHECKS) {
    const present = Boolean(String(process.env[env] || '').trim());
    console.log(`  ${present ? '✓' : '—'} ${label} (${env})`);
}

const live = process.argv.includes('--live');
if (!live) {
    console.log('\nRun developer Model Health at /developer/model-diagnostics with Plus Test Mode for live tests.');
    console.log('Or re-run with --live after setting keys (uses modelDiagnosticsService; not run here).');
    process.exit(0);
}

console.log('\n--live requested: use POST /api/developer/model-diagnostics/test from the dashboard (keys stay server-side).');
