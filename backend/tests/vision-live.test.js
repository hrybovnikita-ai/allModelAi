/**
 * Optional live provider check. Run manually:
 *   RUN_LIVE_VISION=1 node --test tests/vision-live.test.js
 * Requires GEMINI_API_KEY (or OpenAI) in backend .env — never log secrets.
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DEVELOPER_EMAILS = 'live-vision@example.com';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-vision-live-${process.pid}.sqlite`);
process.env.API_KEY = 'test-key';
delete process.env.DATABASE_URL;
fs.rmSync(process.env.DB_FILE, { force: true });

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
delete process.env.DATABASE_URL;
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-vision-live-${process.pid}.sqlite`);

const live = process.env.RUN_LIVE_VISION === '1' && Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());

const app = require('../app');
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('live vision provider (optional)', { skip: !live }, () => {
    let api;
    let originalFetch;

    before(async () => {
        originalFetch = global.fetch;
        api = request.agent(app);
        await api.post('/api/auth/register').send({ name: 'Live', email: 'live-vision@example.com', password: 'test-password-live' });
    });

    after(() => {
        global.fetch = originalFetch;
        app.locals.db.close();
    });

    test('smart chat returns non-empty description for a tiny PNG', async () => {
        const response = await api.post('/api/chat').send({
            model: 'smart',
            temporary: true,
            messages: [{
                role: 'user',
                text: 'What do you see in this image? Explain it in one sentence.',
                image: tinyPng,
            }],
        });
        assert.equal(response.status, 200, `expected 200, got ${response.status} ${response.text?.slice(0, 200)}`);
        assert.match(response.text, /data: /);
        assert.doesNotMatch(response.text, /Could not connect/i);
        const hasText = /data: \{"text":/.test(response.text) || /"text":"[^"]{8,}/.test(response.text);
        assert.ok(hasText, 'stream should include assistant text from vision model');
    });
});
