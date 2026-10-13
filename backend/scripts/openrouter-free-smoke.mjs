#!/usr/bin/env node
/**
 * Safe smoke test for OpenRouter :free models. Never prints API keys.
 * Usage: node scripts/openrouter-free-smoke.mjs
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const {
    resolveOpenRouterFreeRoute,
    NEMOTRON_FREE_MODEL,
    DEEPSEEK_R1_FREE_MODEL,
    mapOpenRouterFreeHttpError,
} = require('../src/services/openRouterFreeModels.js');

const TIMEOUT_MS = 45000;

async function smokeSlug(slug, prompt) {
    const route = resolveOpenRouterFreeRoute(slug);
    if (!route) {
        return { slug, status: 'skipped', reason: 'Dedicated OpenRouter free API key not configured' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${route.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: route.modelId,
                stream: false,
                max_tokens: 64,
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const detail = data?.error?.message || data?.errors?.[0]?.message || `HTTP ${response.status}`;
            const mapped = mapOpenRouterFreeHttpError(response.status, detail);
            return {
                slug,
                status: 'fail',
                httpStatus: response.status,
                code: mapped.code,
                reason: mapped.message,
                keySourceEnv: route.keySourceEnv,
            };
        }
        const text = data?.choices?.[0]?.message?.content;
        if (!String(text || '').trim()) {
            return { slug, status: 'fail', reason: 'Empty model response', keySourceEnv: route.keySourceEnv };
        }
        return {
            slug,
            status: 'ok',
            modelId: route.modelId,
            keySourceEnv: route.keySourceEnv,
            previewLength: String(text).trim().length,
        };
    } catch (error) {
        const mapped = mapOpenRouterFreeHttpError(504, error.message);
        return { slug, status: 'fail', code: mapped.code, reason: mapped.message, keySourceEnv: route.keySourceEnv };
    } finally {
        clearTimeout(timer);
    }
}

const results = await Promise.all([
    smokeSlug('nemotron', 'Reply with one word: OK'),
    smokeSlug('deepseek-r1', 'Reply with one word: OK'),
]);

console.log(JSON.stringify({
    nemotronModel: NEMOTRON_FREE_MODEL,
    deepseekR1Model: DEEPSEEK_R1_FREE_MODEL,
    results,
}, null, 2));

const anyFail = results.some((r) => r.status === 'fail');
process.exit(anyFail ? 1 : 0);
