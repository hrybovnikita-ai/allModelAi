/**
 * One-off local repro for POST /api/chat (claude + haiku). Does not print secrets.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const request = require('supertest');
const crypto = require('node:crypto');

const email = `claude-repro-${Date.now()}@example.com`;
process.env.ENABLE_PLUS_TEST_MODE = 'true';
process.env.DEVELOPER_EMAILS = email;
const password = 'ClaudeRepro123!';

async function main() {
    delete require.cache[require.resolve('../app')];
    const app = require('../app');
    const agent = request.agent(app);

    const reg = await agent.post('/api/auth/register').send({ name: 'Claude Repro', email, password });
    if (reg.status !== 201) {
        console.error('REGISTER_FAILED', reg.status, reg.body?.message || reg.text?.slice(0, 200));
        process.exit(1);
    }

    const dev = await agent.patch('/api/access-mode').send({ mode: 'developer' });
    console.log('ACCESS_MODE', dev.status, dev.body?.mode, dev.body?.plusTestMode, dev.body?.canUseDeveloper);

    const correlationId = crypto.randomUUID();
    const chat = await agent
        .post('/api/chat')
        .set('X-Request-Id', correlationId)
        .send({
            model: 'claude',
            variant: 'haiku',
            temporary: true,
            messages: [{ role: 'user', text: 'Hello' }],
        });

    console.log('CORRELATION_ID', correlationId);
    console.log('CHAT_STATUS', chat.status);
    console.log('CHAT_CODE', chat.body?.code || '(stream)');
    const preview = chat.body?.message || String(chat.text || '').slice(0, 240);
    console.log('CHAT_PREVIEW', preview.replace(/\s+/g, ' ').trim());

    try {
        app.locals.db.close();
    } catch {
        /* ignore */
    }
    process.exit(chat.status >= 500 ? 1 : 0);
}

main().catch((error) => {
    console.error('REPRO_CRASH', error.name, error.message);
    console.error(error.stack?.split('\n').slice(0, 8).join('\n'));
    process.exit(1);
});
