const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ENABLE_PLUS_TEST_MODE = 'true';
process.env.DEVELOPER_EMAILS = 'tester@example.com';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-video-history-${process.pid}.sqlite`);
process.env.API_KEY = 'test-key';
fs.rmSync(process.env.DB_FILE, { force: true });

const app = require('../app');

test('GET /api/chat/history rebuilds video from conversation-linked job when messages were wiped', async () => {
    const api = request.agent(app);
    await api.post('/api/auth/register').send({
        name: 'Tester',
        email: 'video-history@example.com',
        password: 'test-password',
    });

    const conversationId = 'conv-video-rebuild';
    const jobId = 'vjob-test-rebuild';
    const db = app.locals.db.database;
    db.prepare(`
        INSERT INTO conversations (id, email, model, title, messages, created_at, updated_at)
        VALUES (?, ?, 'gpt', 'Dragon video', '[]', datetime('now'), datetime('now'))
    `).run(conversationId, 'video-history@example.com');
    db.prepare(`
        INSERT INTO video_generation_jobs (
            id, email, provider, mode, prompt, status,
            aspect_ratio, resolution, model, duration_seconds,
            video_url, stored_relative_path, mime_type,
            conversation_id, created_at, updated_at
        ) VALUES (?, ?, 'magichour', 'text-to-video', ?, 'completed', '16:9', '480p', 'ltx-2.5', 3,
            NULL, ?, 'video/mp4', ?, datetime('now'), datetime('now'))
    `).run(
        jobId,
        'video-history@example.com',
        'Golden dragon prompt for rebuild test',
        `generated-videos/${jobId}.mp4`,
        conversationId,
    );

    const history = await api.get(`/api/chat/history/${conversationId}`);
    assert.equal(history.status, 200);
    const conversation = history.body;
    assert.ok(conversation?.id === conversationId, 'conversation should be returned');
    const assistant = conversation.messages.find((item) => item.role === 'assistant');
    assert.ok(assistant, 'assistant message should be rebuilt');
    assert.equal(assistant.videoJobId, jobId);
    assert.match(assistant.videoUrl, /\/api\/video\/jobs\/vjob-test-rebuild\/stream/);
    assert.equal(assistant.videoAttachment?.version, 1);
    assert.equal(assistant.videoAttachment?.videoJobId, jobId);

    app.locals.db.close();
});
