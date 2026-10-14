#!/usr/bin/env node
/**
 * Lists Gemini models for the server API key and smoke-tests generateContent.
 * Never prints GEMINI_API_KEY.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const {
    listGeminiModels,
    filterGeminiCatalogModels,
    supportsGenerateContent,
    testGeminiGenerateContent,
    isGeminiConfigured,
} = require('../src/services/geminiApiService.js');

const PROMPT = 'Hello, respond with OK';

if (!isGeminiConfigured()) {
    console.log(JSON.stringify({
        configured: false,
        message: 'GEMINI_API_KEY is not set in backend/.env',
    }, null, 2));
    process.exit(1);
}

const listed = await listGeminiModels();
if (!listed.ok) {
    console.log(JSON.stringify({
        configured: true,
        listModels: { ok: false, httpStatus: listed.status, error: listed.error },
    }, null, 2));
    process.exit(1);
}

const catalog = filterGeminiCatalogModels(listed.models);
const tests = [];
for (const model of catalog) {
    // eslint-disable-next-line no-await-in-loop
    const result = await testGeminiGenerateContent(model.apiId, { prompt: PROMPT });
    tests.push({
        displayName: model.displayName,
        apiId: model.apiId,
        generateContent: supportsGenerateContent(model),
        inputTokenLimit: model.inputTokenLimit,
        outputTokenLimit: model.outputTokenLimit,
        freeTierFromApi: 'not disclosed by ListModels API — verify in Google AI Studio / Cloud billing',
        accessible: result.ok,
        httpStatus: result.httpStatus || result.error?.clientStatus,
        testResult: result.ok ? 'pass' : 'fail',
        errorClass: result.error?.errorClass || null,
        errorMessage: result.error?.message || null,
        responsePreview: result.preview || null,
    });
}

console.log(JSON.stringify({
    configured: true,
    totalModelsListed: listed.models.length,
    flashFlashLiteProWithGenerateContent: catalog.length,
    models: tests,
}, null, 2));

process.exit(tests.some((t) => t.testResult === 'fail') ? 1 : 0);
