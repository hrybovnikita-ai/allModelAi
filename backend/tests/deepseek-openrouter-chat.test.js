const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');
const {
    chatWithDeepSeek,
    DeepSeekChatError,
    setOpenRouterClientFactoryForTests,
    resetOpenRouterClientFactoryForTests,
} = require('../src/services/deepseekOpenRouterChat');

test('deepseek openrouter chat service', async (t) => {
    t.after(() => {
        resetOpenRouterClientFactoryForTests();
        delete process.env.OPENROUTER_API_KEY;
    });

    await t.test('rejects empty message', async () => {
        await assert.rejects(
            () => chatWithDeepSeek('   '),
            (err) => err instanceof DeepSeekChatError && err.status === 400,
        );
    });

    await t.test('503 when OPENROUTER_API_KEY is missing', async () => {
        delete process.env.OPENROUTER_API_KEY;
        await assert.rejects(
            () => chatWithDeepSeek('hello'),
            (err) => err instanceof DeepSeekChatError && err.status === 503,
        );
    });

    await t.test('returns reply from mocked OpenRouter client', async () => {
        process.env.OPENROUTER_API_KEY = 'test-key-not-logged';
        setOpenRouterClientFactoryForTests(() => ({
            chat: {
                completions: {
                    create: async () => ({
                        choices: [{ message: { content: 'Mock DeepSeek reply' } }],
                    }),
                },
            },
        }));
        const reply = await chatWithDeepSeek('What is 2+2?');
        assert.equal(reply, 'Mock DeepSeek reply');
    });

    await t.test('maps 401 from SDK', async () => {
        process.env.OPENROUTER_API_KEY = 'bad-key';
        setOpenRouterClientFactoryForTests(() => ({
            chat: {
                completions: {
                    create: async () => {
                        const err = new Error('Unauthorized');
                        err.status = 401;
                        throw err;
                    },
                },
            },
        }));
        await assert.rejects(
            () => chatWithDeepSeek('hi'),
            (err) => err instanceof DeepSeekChatError && err.status === 401,
        );
    });
});

test('POST /api/chat/deepseek', async (t) => {
    t.after(() => {
        resetOpenRouterClientFactoryForTests();
    });

    await t.test('requires authentication', async () => {
        const res = await request(app).post('/api/chat/deepseek').send({ message: 'hello' });
        assert.equal(res.status, 401);
    });

    await t.test('returns reply for authenticated user', async () => {
        process.env.OPENROUTER_API_KEY = 'test-key';
        setOpenRouterClientFactoryForTests(() => ({
            chat: {
                completions: {
                    create: async () => ({
                        choices: [{ message: { content: 'Hello from DeepSeek' } }],
                    }),
                },
            },
        }));

        const email = `deepseek-${Date.now()}@example.com`;
        const signup = await request(app)
            .post('/api/auth/register')
            .send({ name: 'DeepSeek User', email, password: 'Password123!' });
        const cookie = signup.headers['set-cookie'];

        const res = await request(app)
            .post('/api/chat/deepseek')
            .set('Cookie', cookie)
            .send({ message: 'Say hi in one word' });
        assert.equal(res.status, 200);
        assert.equal(res.body.reply, 'Hello from DeepSeek');
    });
});
