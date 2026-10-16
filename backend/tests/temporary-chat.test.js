'use strict';

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-temp-chat-${process.pid}-${Date.now()}.sqlite`);

const {
    TEMPORARY_CHAT_TTL_MS,
    computeExpiresAt,
    isTemporaryExpired,
    assertTemporaryAccessible,
    purgeExpiredTemporaryConversations,
    setTemporaryChatClock,
    resetTemporaryChatClock,
    nowIso,
} = require('../src/services/temporaryChat');

const app = require('../app');

describe('temporary chat policy helpers', () => {
    afterEach(() => {
        resetTemporaryChatClock();
    });

    test('expires_at is exactly 72 hours after creation', () => {
        const created = '2026-01-01T00:00:00.000Z';
        const expires = computeExpiresAt(created);
        assert.equal(expires, '2026-01-04T00:00:00.000Z');
        assert.equal(TEMPORARY_CHAT_TTL_MS, 72 * 60 * 60 * 1000);
    });

    test('messages must not extend expiry (helpers ignore updated_at)', () => {
        const row = {
            isTemporary: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-03T23:00:00.000Z',
            expiresAt: computeExpiresAt('2026-01-01T00:00:00.000Z'),
        };
        setTemporaryChatClock(Date.parse('2026-01-03T23:30:00.000Z'));
        assert.equal(isTemporaryExpired(row), false);
        setTemporaryChatClock(Date.parse('2026-01-04T00:00:00.000Z'));
        assert.equal(isTemporaryExpired(row), true);
        const denied = assertTemporaryAccessible(row);
        assert.equal(denied.ok, false);
        assert.equal(denied.status, 410);
        assert.equal(denied.code, 'TEMPORARY_CHAT_EXPIRED');
    });

    test('regular conversations are unaffected by temporary expiry helpers', () => {
        const row = {
            isTemporary: false,
            createdAt: '2020-01-01T00:00:00.000Z',
            expiresAt: null,
        };
        setTemporaryChatClock(Date.parse('2030-01-01T00:00:00.000Z'));
        assert.equal(isTemporaryExpired(row), false);
        assert.equal(assertTemporaryAccessible(row).ok, true);
    });
});

describe('temporary chat HTTP API', () => {
    let agent;
    let email;
    const password = 'TempChatPass1!';

    before(async () => {
        email = `temp-chat-${Date.now()}@example.com`;
        agent = request.agent(app);
        const register = await agent.post('/api/auth/register').send({
            name: 'Temp Chat',
            email,
            password,
        });
        assert.ok([200, 201].includes(register.status), `register failed: ${register.status}`);
        const login = await agent.post('/api/auth/login').send({ email, password });
        assert.equal(login.status, 200);
    });

    afterEach(() => {
        resetTemporaryChatClock();
    });

    after(() => {
        resetTemporaryChatClock();
    });

    test('creates temporary conversation with fixed 72h expiry and excludes it from regular history', async () => {
        const created = await agent.post('/api/chat/history').send({
            model: 'gpt',
            temporary: true,
            messages: [{ role: 'user', content: 'hello temporary' }],
        });
        assert.equal(created.status, 201);
        assert.equal(created.body.isTemporary, true);
        assert.ok(created.body.expiresAt);
        assert.ok(created.body.id);
        assert.equal(
            Date.parse(created.body.expiresAt) - Date.parse(created.body.createdAt),
            TEMPORARY_CHAT_TTL_MS,
        );

        const regular = await agent.get('/api/chat/history');
        assert.equal(regular.status, 200);
        assert.equal(
            regular.body.some((item) => String(item.id) === String(created.body.id)),
            false,
        );

        const temps = await agent.get('/api/chat/history?temporary=true');
        assert.equal(temps.status, 200);
        const found = temps.body.find((item) => String(item.id) === String(created.body.id));
        assert.ok(found);
        assert.equal(found.isTemporary, true);
        assert.ok(found.expiresAt);
    });

    test('model switch on temporary chat does not create a regular history entry', async () => {
        const created = await agent.post('/api/chat/history').send({
            model: 'gemini',
            temporary: true,
            messages: [{ role: 'user', content: 'model A' }],
        });
        assert.equal(created.status, 201);

        const renamed = await agent.patch(`/api/chat/history/${created.body.id}`).send({
            messages: [
                { role: 'user', content: 'model A' },
                { role: 'assistant', content: 'reply' },
            ],
        });
        assert.equal(renamed.status, 200);
        assert.equal(renamed.body.isTemporary, true);
        assert.equal(renamed.body.expiresAt, created.body.expiresAt);

        const regular = await agent.get('/api/chat/history');
        assert.equal(
            regular.body.some((item) => String(item.id) === String(created.body.id)),
            false,
        );
    });

    test('regular conversations remain listable separately', async () => {
        const regularCreate = await agent.post('/api/chat/history').send({
            model: 'gpt',
            temporary: false,
            messages: [{ role: 'user', content: 'permanent chat' }],
        });
        assert.equal(regularCreate.status, 201);
        assert.equal(Boolean(regularCreate.body.isTemporary), false);

        const regular = await agent.get('/api/chat/history');
        assert.ok(regular.body.some((item) => String(item.id) === String(regularCreate.body.id)));

        const temps = await agent.get('/api/chat/history?temporary=true');
        assert.equal(
            temps.body.some((item) => String(item.id) === String(regularCreate.body.id)),
            false,
        );
    });

    test('expired temporary chats become inaccessible and are purged by cleanup', async () => {
        const createdAt = Date.parse('2026-02-01T12:00:00.000Z');
        setTemporaryChatClock(createdAt);
        const created = await agent.post('/api/chat/history').send({
            model: 'claude',
            temporary: true,
            messages: [{ role: 'user', content: 'will expire' }],
        });
        assert.equal(created.status, 201);
        const id = created.body.id;
        const originalExpires = created.body.expiresAt;

        // Advance past expiry without waiting 72 real hours.
        setTemporaryChatClock(Date.parse(originalExpires) + 1000);

        const expiredList = await agent.get('/api/chat/history?temporary=true');
        assert.equal(
            expiredList.body.some((item) => String(item.id) === String(id)),
            false,
        );

        const patch = await agent.patch(`/api/chat/history/${id}`).send({
            messages: [{ role: 'user', content: 'too late' }],
        });
        assert.equal(patch.status, 410);
        assert.equal(patch.body.code, 'TEMPORARY_CHAT_EXPIRED');

        const share = await agent.post(`/api/chat/history/${id}/share`).send({});
        assert.ok([400, 410].includes(share.status));

        const purged = await purgeExpiredTemporaryConversations(app.locals.db, {
            atMs: Date.parse(originalExpires) + 1000,
        });
        assert.ok(purged.deleted >= 1);
        assert.ok(purged.ids.includes(id));

        const gone = await agent.get('/api/chat/history?temporary=true');
        assert.equal(gone.body.some((item) => String(item.id) === String(id)), false);
    });

    test('rejects cross-account access to temporary chats', async () => {
        setTemporaryChatClock(Date.now());
        const created = await agent.post('/api/chat/history').send({
            model: 'gpt',
            temporary: true,
            messages: [{ role: 'user', content: 'private temp' }],
        });
        assert.equal(created.status, 201);

        const otherEmail = `other-temp-${Date.now()}@example.com`;
        const other = request.agent(app);
        assert.ok([200, 201].includes(
            (await other.post('/api/auth/register').send({
                name: 'Other',
                email: otherEmail,
                password,
            })).status,
        ));
        assert.equal((await other.post('/api/auth/login').send({ email: otherEmail, password })).status, 200);

        const stolen = await other.patch(`/api/chat/history/${created.body.id}`).send({
            title: 'hacked',
        });
        assert.equal(stolen.status, 404);

        const deleted = await other.delete(`/api/chat/history/${created.body.id}`);
        assert.equal(deleted.status, 404);
    });

    test('blocks sharing temporary chats while unexpired', async () => {
        setTemporaryChatClock(Date.now());
        const created = await agent.post('/api/chat/history').send({
            model: 'gpt',
            temporary: true,
            messages: [{ role: 'user', content: 'no share' }],
        });
        assert.equal(created.status, 201);
        const share = await agent.post(`/api/chat/history/${created.body.id}/share`).send({});
        assert.equal(share.status, 400);
        assert.equal(share.body.code, 'TEMPORARY_CHAT_NO_SHARE');
    });

    test('clock helper exposes stable nowIso for controlled tests', () => {
        setTemporaryChatClock(Date.parse('2026-06-01T00:00:00.000Z'));
        assert.equal(nowIso(), '2026-06-01T00:00:00.000Z');
    });
});
