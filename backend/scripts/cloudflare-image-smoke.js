#!/usr/bin/env node
/**
 * One-shot Cloudflare Workers AI image smoke test (server-side only).
 * Usage: node scripts/cloudflare-image-smoke.js
 * Never prints API tokens or image bytes.
 */
const path = require('node:path');
try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

const PROMPT = process.argv[2] || 'A golden dragon flying over a futuristic city at night.';
const { generateCloudflareWorkersAiImage, getCloudflareImageConfig } = require('../src/services/cloudflareImageService');

async function main() {
    const config = getCloudflareImageConfig();
    console.log('cloudflare_account_id_present:', Boolean(config.accountId));
    console.log('cloudflare_token_present:', Boolean(config.apiToken));
    console.log('cloudflare_model:', config.model);
    if (!config.accountId || !config.apiToken) {
        console.log('result: blocked — set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (or CLOUDFLARE_API_KEY) on the backend host');
        process.exitCode = 1;
        return;
    }
    console.log('calling_workers_ai…');
    const started = Date.now();
    const result = await generateCloudflareWorkersAiImage({ prompt: PROMPT });
    console.log('duration_ms:', Date.now() - started);
    console.log('ok:', result.ok === true);
    if (!result.ok) {
        console.log('http_status:', result.clientStatus || result.status);
        console.log('code:', result.code);
        console.log('message:', result.userMessage || result.internalMessage || '(none)');
        process.exitCode = 1;
        return;
    }
    const url = result.imageUrl || '';
    console.log('image_data_url:', /^data:image\//.test(url) ? 'valid' : 'invalid');
    console.log('image_payload_chars:', url.length);
    console.log('mime_type:', result.mimeType || '(unknown)');
}

main().catch((error) => {
    console.log('error:', error.name);
    process.exitCode = 1;
});
