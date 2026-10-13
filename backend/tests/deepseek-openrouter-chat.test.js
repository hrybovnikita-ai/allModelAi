const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');
const {
    chatWithDeepSeek,
    DeepSeekChatError,
    DEEPSEEK_FREE_MODEL,
    DEEPSEEK_FREE_OPENROUTER_KEY_ENV,
    DEEPSEEK_FREE_OPENROUTER_KEY_LEGACY_ENV,
    getDeepSeekFreeOpenRouterKeySourceEnvName,
    setOpenRouterClientFactoryForTests,
    resetOpenRouterClientFactoryForTests,
} = require('../src/services/deepseekOpenRouterChat');

const OPENROUTER_ENV_KEYS = [
    DEEPSEEK_FREE_OPENROUTER_KEY_ENV,
    DEEPSEEK_FREE_OPENROUTER_KEY_LEGACY_ENV,
    'OPENROUTER_API_KEY',
    'ALLMODELAI_OPENROUTER_API_KEY',
    'API_KEY',
];

function clearOpenRouterEnv() {
    for (const key of OPENROUTER_ENV_KEYS) {
        delete process.env[key];
    }
}

test('deepseek openrouter chat service', async (t) => {
    t.after(() => {
        resetOpenRouterClientFactoryForTests();
        clearOpenRouterEnv();
    });

    assert.equal(DEEPSEEK_FREE_MODEL, 'deepseek/deepseek-r1-0528:free');

    await t.test('rejects empty message', async () => {
        await assert.rejects(
            () => chatWithDeepSeek('   '),
            (err) => err instanceof DeepSeekChatError && err.status === 400,
        );
    });

    await t.test('503 when no OpenRouter key is configured', async () => {
        clearOpenRouterEnv();
        await assert.rejects(
            () => chatWithDeepSeek('hello'),
            (err) => err instanceof DeepSeekChatError && err.status === 503,
        );
    });

    await t.test('uses OPENROUTER_DEEPSEEK_FREE_API_KEY and ignores general OpenRouter key when dedicated unset', async () => {
        clearOpenRouterEnv();
        process.env.OPENROUTER_API_KEY = 'general-key';
        assert.equal(getDeepSeekFreeOpenRouterKeySourceEnvName(), null);
        process.env[DEEPSEEK_FREE_OPENROUTER_KEY_ENV] = 'dedicated-key';
        assert.equal(getDeepSeekFreeOpenRouterKeySourceEnvName(), DEEPSEEK_FREE_OPENROUTER_KEY_ENV);
    });

    await t.test('returns reply from mocked OpenRouter client with r1 free model', async () => {
        clearOpenRouterEnv();
        process.env[DEEPSEEK_FREE_OPENROUTER_KEY_ENV] = 'test-key-not-logged';
        let capturedModel;
        setOpenRouterClientFactoryForTests(() => ({
            chat: {
                completions: {
                    create: async (payload) => {
                        capturedModel = payload.model;
                        return {
                            choices: [{ message: { content: 'Mock DeepSeek reply' } }],
                        };
                    },
                },
            },
        }));
        const reply = await chatWithDeepSeek('What is 2+2?');
        assert.equal(reply, 'Mock DeepSeek reply');
        assert.equal(capturedModel, DEEPSEEK_FREE_MODEL);
        assert.equal(DEEPSEEK_FREE_MODEL, 'deepseek/deepseek-r1-0528:free');
    });

    await t.test('maps 401 from SDK', async () => {
        clearOpenRouterEnv();
        process.env[DEEPSEEK_FREE_OPENROUTER_KEY_ENV] = 'bad-key';
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
        clearOpenRouterEnv();
    });

    await t.test('requires authentication', async () => {
        const res = await request(app).post('/api/chat/deepseek').send({ message: 'hello' });
        assert.equal(res.status, 401);
    });

    await t.test('returns reply for authenticated user', async () => {
        process.env[DEEPSEEK_FREE_OPENROUTER_KEY_ENV] = 'test-key';
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
