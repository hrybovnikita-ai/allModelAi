'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-feat-${process.pid}-${Date.now()}.sqlite`);
process.env.FEATURE_AI_FILE_MANAGER = 'true';
process.env.FEATURE_AI_WORKFLOWS = 'true';
process.env.FEATURE_AI_EVALUATION_LAB = 'true';
process.env.FEATURE_OLLAMA_LOCAL = 'true';
process.env.OLLAMA_URL = 'http://127.0.0.1:11434';
process.env.OLLAMA_ALLOWLIST_HOSTS = '127.0.0.1,localhost';

const { assertAllowedUpload, extractPlainText } = require('../src/services/aiFileManager/documentExtract');
const { validateWorkflowGraph } = require('../src/services/aiWorkflows/workflowGraph');
const { resolveOllamaBaseUrl } = require('../src/services/ollama/ollamaAdapter');
const { scoreDeterministic, getDataset } = require('../src/services/evaluationLab/evaluationDatasets');
const { assertStripeCheckoutAllowed } = require('../src/payments/stripeMode');

const app = require('../app');

async function registerAgent() {
    const email = `feat-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
    const password = 'FeatureTestPass1';
    const agent = request.agent(app);
    assert.equal((await agent.post('/api/auth/register').send({ name: 'Feat', email, password })).status, 201);
    return agent;
}

describe('AI File Manager extract', () => {
    test('rejects unsupported types and binary pdf bodies', () => {
        assert.throws(() => assertAllowedUpload({ filename: 'x.exe', mimeType: 'application/octet-stream' }));
        assert.throws(() => extractPlainText('%PDF-1.4 binary', { filename: 'a.pdf', mimeType: 'application/pdf' }));
        const ok = extractPlainText('hello,world\n1,2', { filename: 'a.csv', mimeType: 'text/csv' });
        assert.match(ok.text, /hello/);
    });

    test('upload and list require auth ownership', async () => {
        const agent = await registerAgent();
        const uploaded = await agent.post('/api/ai-files').send({
            name: 'notes.txt',
            mimeType: 'text/plain',
            content: 'AllModelAI file manager test document about robotics.',
        });
        assert.equal(uploaded.status, 201);
        const listed = await agent.get('/api/ai-files');
        assert.equal(listed.status, 200);
        assert.ok(listed.body.files.some((file) => file.name === 'notes.txt'));
        const other = await registerAgent();
        const otherList = await other.get('/api/ai-files');
        assert.equal(otherList.body.files.some((file) => file.name === 'notes.txt'), false);
    });
});

describe('AI Workflows', () => {
    test('rejects cycles', () => {
        assert.throws(() => validateWorkflowGraph({
            nodes: [
                { id: 'a', model: 'gemini' },
                { id: 'b', model: 'claude' },
            ],
            edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
        }));
    });

    test('save template workflow and run', async () => {
        const agent = await registerAgent();
        const templates = await agent.get('/api/workflows/templates');
        assert.equal(templates.status, 200);
        assert.ok(templates.body.templates.length >= 1);
        const graph = templates.body.templates[0].graph;
        const saved = await agent.post('/api/workflows').send({
            name: 'Doc pipeline',
            graph,
            templateId: templates.body.templates[0].id,
        });
        assert.equal(saved.status, 201);
        const run = await agent.post(`/api/workflows/${saved.body.id}/run`).send({ inputText: 'Quarterly notes' });
        assert.equal(run.status, 202);
        assert.ok(['completed', 'failed', 'cancelled'].includes(run.body.run.status));
    });
});

describe('Evaluation Lab', () => {
    test('deterministic math item scores correctly', () => {
        const dataset = getDataset('mathematics');
        const item = dataset.items[0];
        assert.equal(scoreDeterministic(item, 'The area is 9 * pi').passed, true);
        assert.equal(scoreDeterministic(item, '42').passed, false);
    });

    test('evaluation run stays private per user', async () => {
        const agent = await registerAgent();
        const started = await agent.post('/api/evaluation/runs').send({
            datasetId: 'coding',
            models: ['gemini'],
        });
        assert.equal(started.status, 202);
        const runId = started.body.run.id;
        const mine = await agent.get(`/api/evaluation/runs/${runId}`);
        assert.equal(mine.status, 200);
        const other = await registerAgent();
        const blocked = await other.get(`/api/evaluation/runs/${runId}`);
        assert.equal(blocked.status, 404);
    });
});

describe('Ollama adapter security', () => {
    test('allowlists localhost and blocks arbitrary hosts', () => {
        process.env.OLLAMA_URL = 'http://127.0.0.1:11434';
        assert.equal(resolveOllamaBaseUrl(), 'http://127.0.0.1:11434');
        process.env.OLLAMA_URL = 'http://evil.example:11434';
        assert.throws(() => resolveOllamaBaseUrl());
        process.env.OLLAMA_URL = 'http://127.0.0.1:11434';
    });

    test('status endpoint fails gracefully when offline', async () => {
        const agent = await registerAgent();
        const res = await agent.get('/api/ollama/status');
        assert.ok([200, 503, 403].includes(res.status));
        assert.equal(typeof res.body.online, 'boolean');
    });
});

describe('Billing live checkout flag', () => {
    test('live keys blocked when FEATURE_BILLING_LIVE_CHECKOUT is false', () => {
        const prevSecret = process.env.STRIPE_SECRET_KEY;
        const prevMode = process.env.STRIPE_MODE;
        const prevFlag = process.env.FEATURE_BILLING_LIVE_CHECKOUT;
        process.env.STRIPE_SECRET_KEY = 'sk_live_examplekeyforguardtest';
        process.env.STRIPE_MODE = 'live';
        process.env.FEATURE_BILLING_LIVE_CHECKOUT = 'false';
        const result = assertStripeCheckoutAllowed();
        assert.equal(result.ok, false);
        assert.equal(result.code, 'LIVE_CHECKOUT_DISABLED');
        process.env.STRIPE_SECRET_KEY = prevSecret;
        process.env.STRIPE_MODE = prevMode;
        process.env.FEATURE_BILLING_LIVE_CHECKOUT = prevFlag;
    });
});
