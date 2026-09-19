const { test } = require('node:test');
const assert = require('node:assert/strict');
const user = { id: 1, name: 'Session User', email: 'session@example.com' };
let instance = 0;
const fresh = () => import(`../../frontend/src/lib/session.js?state=${instance++}`);

test('login confirmation bypasses cached state and rejects a missing cookie', async () => {
    const original = global.fetch;
    try {
        let calls = 0;
        global.fetch = async () => { calls++; return new Response('{}', { status: 401 }); };
        const session = await fresh();
        session.rememberSession(user);
        await assert.rejects(session.confirmSession(user), /could not be verified/);
        assert.equal(calls, 1);
        assert.equal(await session.restoreSession(), null);
    } finally { global.fetch = original; }
});

test('logout during response parsing cannot resurrect a session', async () => {
    const original = global.fetch;
    try {
        let finish;
        let parsing;
        const started = new Promise((resolve) => { parsing = resolve; });
        global.fetch = async () => ({ ok: true, status: 200, json: () => {
            parsing();
            return new Promise((resolve) => { finish = resolve; });
        } });
        const session = await fresh();
        const pending = session.restoreSession();
        const rejection = assert.rejects(pending, /Session changed/);
        await started;
        session.clearAllSessionData();
        finish({ user });
        await rejection;
        global.fetch = async () => new Response('{}', { status: 401 });
        assert.equal(await session.restoreSession(), null);
    } finally { global.fetch = original; }
});

test('login confirmation does not reuse an older pending verification', async () => {
    const original = global.fetch;
    try {
        let finish;
        let calls = 0;
        global.fetch = async () => {
            calls++;
            if (calls === 1) return new Promise((resolve) => { finish = resolve; });
            return new Response(JSON.stringify({ user }));
        };
        const session = await fresh();
        const pending = session.restoreSession();
        const rejection = assert.rejects(pending, /Session changed/);
        assert.deepEqual(await session.confirmSession(user), user);
        finish(new Response('{}', { status: 401 }));
        await rejection;
        assert.deepEqual(await session.restoreSession(), user);
        assert.equal(calls, 2);
    } finally { global.fetch = original; }
});

test('chat only offers recovery after a definitive session 401', async () => {
    const original = global.fetch;
    const { checkChatResponse, apiFetch } = await import('../../frontend/src/lib/api.js');
    try {
        let calls = 0;
        global.fetch = async (_, options) => {
            calls++;
            assert.equal(options.credentials, 'include');
            return new Response(JSON.stringify({ user }));
        };
        await assert.rejects(checkChatResponse(new Response('{}', { status: 401 })), (error) => {
            assert.equal(error.sessionExpired, false);
            assert.match(error.message, /session is active/);
            return true;
        });
        assert.equal(calls, 1, 'one verification, no authentication loop');
        await apiFetch('/api/chat/history', { credentials: 'omit' });
        global.fetch = async () => new Response('{}', { status: 503 });
        await assert.rejects(checkChatResponse(new Response('{}', { status: 401 })), (error) => {
            assert.notEqual(error.sessionExpired, true);
            assert.match(error.message, /Could not verify/);
            return true;
        });
        global.fetch = async () => { throw new TypeError('Failed to fetch'); };
        await assert.rejects(checkChatResponse(new Response('{}', { status: 401 })), (error) => error.sessionExpired !== true);
        global.fetch = async () => new Response('{}', { status: 401 });
        await assert.rejects(checkChatResponse(new Response('{}', { status: 401 })), (error) => error.sessionExpired === true);
    } finally { global.fetch = original; }
});
