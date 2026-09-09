const {
    describe,
    test,
    before,
    after
} = require('node:test');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';

process.env.DB_FILE = path.join(
    os.tmpdir(),
    `allmodelai-users-secure-${process.pid}.sqlite`
);

process.env.ADMIN_KEY = 'test-admin';

fs.rmSync(process.env.DB_FILE, {
    force: true
});

const app = require('../app');

let owner;
let viewer;

describe('accounts, teams, and sharing', () => {

    before(async () => {
        owner = request.agent(app);
        viewer = request.agent(app);

        // =========================
        // REGISTER OWNER
        // =========================

        const ownerRegister = await owner
            .post('/api/auth/register')
            .send({
                name: 'Owner',
                email: 'owner@example.com',
                password: 'Secret123!'
            });

        console.log(
            'OWNER REGISTER:',
            ownerRegister.status,
            ownerRegister.body
        );

        console.log(
            'OWNER COOKIE:',
            ownerRegister.headers['set-cookie']
        );

        // =========================
        // REGISTER VIEWER
        // =========================

        const viewerRegister = await viewer
            .post('/api/auth/register')
            .send({
                name: 'Viewer',
                email: 'viewer@example.com',
                password: 'Secret123!'
            });

        console.log(
            'VIEWER REGISTER:',
            viewerRegister.status,
            viewerRegister.body
        );

        console.log(
            'VIEWER COOKIE:',
            viewerRegister.headers['set-cookie']
        );

        // =========================
        // CHECK SQLITE SESSIONS
        // =========================

        const sessions = app.locals.db.database
            .prepare(`
                SELECT
                    user_id,
                    expires_at
                FROM auth_sessions
            `)
            .all();

        console.log(
            'SESSIONS:',
            sessions
        );
    });

    after(() => {
        app.locals.db.close();
    });

    // =========================
    // SESSION
    // =========================

    test(
        'returns the active HTTP-only session',
        async () => {

            const response = await owner
                .get('/api/auth/session');

            console.log(
                'OWNER SESSION RESPONSE:',
                response.status,
                response.body
            );

            assert.equal(
                response.status,
                200
            );

            assert.equal(
                response.body.user.email,
                'owner@example.com'
            );
        }
    );

    // =========================
    // ADMIN
    // =========================

    test(
        'protects user administration with both session and admin key',
        async () => {

            const anonymousResponse = await request(app)
                .get('/api/users');

            assert.equal(
                anonymousResponse.status,
                401
            );

            const adminWithoutSession = await request(app)
                .get('/api/users')
                .set(
                    'x-admin-key',
                    'test-admin'
                );

            assert.equal(
                adminWithoutSession.status,
                401
            );

            const ownerAdminResponse = await owner
                .get('/api/users')
                .set(
                    'x-admin-key',
                    'test-admin'
                );

            assert.equal(
                ownerAdminResponse.status,
                200
            );
        }
    );

    // =========================
    // COMMUNITY
    // =========================

    test(
        'publishes only seeded community profiles',
        async () => {

            const response = await request(app)
                .get('/api/community/users');

            assert.equal(
                response.status,
                200
            );

            assert.equal(
                response.body.length,
                8
            );

            assert.deepEqual(
                Object.keys(
                    response.body[0]
                ).sort(),
                [
                    'email',
                    'id',
                    'name'
                ]
            );

            assert.equal(
                response.body.some(
                    (user) =>
                        user.email ===
                        'owner@example.com'
                ),
                false
            );
        }
    );

    // =========================
    // SEEDED USER LOGIN
    // =========================

    test(
        'signs in a seeded user without exposing the password hash',
        async () => {

            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email:
                        'alice.johnson@gmail.com',
                    password:
                        'AliceAI1!'
                });

            assert.equal(
                response.status,
                200
            );

            assert.equal(
                response.body.user.email,
                'alice.johnson@gmail.com'
            );

            assert.equal(
                response.body.user.passwordHash,
                undefined
            );
        }
    );

    // =========================
    // TEAMS
    // =========================

    test(
        'creates a team and enforces roles',
        async () => {

            const created = await owner
                .post('/api/teams')
                .send({
                    name: 'Product team'
                });

            assert.equal(
                created.status,
                201
            );

            const id = created.body.id;

            const invited = await owner
                .post(
                    `/api/teams/${id}/members`
                )
                .send({
                    email:
                        'viewer@example.com',
                    role:
                        'viewer'
                });

            assert.equal(
                invited.status,
                201
            );

            const forbidden =
                await viewer
                    .post(
                        `/api/teams/${id}/members`
                    )
                    .send({
                        email:
                            'other@example.com'
                    });

            assert.equal(
                forbidden.status,
                403
            );

            const viewerTeams =
                await viewer.get(
                    '/api/teams'
                );

            assert.equal(
                viewerTeams.body[0].role,
                'viewer'
            );
        }
    );

    // =========================
    // SHARED CONVERSATION
    // =========================

    test(
        'publishes a read-only conversation without exposing owner data',
        async () => {

            const chat = await owner
                .post('/api/chat/history')
                .send({
                    model: 'gpt',
                    messages: [
                        {
                            role: 'user',
                            text: 'Public demo'
                        }
                    ]
                });

            const shared = await owner
                .post(
                    `/api/chat/history/${chat.body.id}/share`
                );

            assert.equal(
                shared.status,
                200
            );

            const publicCopy =
                await request(app)
                    .get(
                        `/api/share/${shared.body.token}`
                    );

            assert.equal(
                publicCopy.status,
                200
            );

            assert.equal(
                publicCopy.body.email,
                undefined
            );

            assert.equal(
                publicCopy
                    .body
                    .messages[0]
                    .content,
                'Public demo'
            );
        }
    );

    // =========================
    // ACCOUNT DELETE SECURITY
    // =========================

    test(
        'cannot delete another account by submitting its email',
        async () => {

            const response = await owner
                .delete('/api/auth/account')
                .send({
                    email:
                        'viewer@example.com'
                });

            assert.equal(
                response.status,
                200
            );

            const viewerSession =
                await viewer
                    .get('/api/auth/session');

            assert.equal(
                viewerSession.status,
                200
            );
        }
    );
});