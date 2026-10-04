const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizePrivateKey,
    isFirebaseAdminConfigured,
    resetFirebaseAdminForTests,
} = require('../src/firebaseAdmin');

test('normalizePrivateKey converts escaped newlines and trims wrapping quotes', () => {
    const escaped = '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n';
    assert.equal(
        normalizePrivateKey(escaped),
        '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n',
    );
    assert.equal(
        normalizePrivateKey(`"${escaped}"`),
        '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n',
    );
});

test('isFirebaseAdminConfigured requires project id, client email, and private key', () => {
    const prev = {
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
        FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
    };
    process.env.FIREBASE_PROJECT_ID = 'demo-project';
    process.env.FIREBASE_CLIENT_EMAIL = 'firebase-adminsdk@test.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nline\\n-----END PRIVATE KEY-----\\n';
    resetFirebaseAdminForTests();
    try {
        assert.equal(isFirebaseAdminConfigured(), true);
        delete process.env.FIREBASE_PRIVATE_KEY;
        resetFirebaseAdminForTests();
        assert.equal(isFirebaseAdminConfigured(), false);
    } finally {
        Object.entries(prev).forEach(([key, value]) => {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        });
        resetFirebaseAdminForTests();
    }
});
