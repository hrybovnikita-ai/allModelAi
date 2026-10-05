const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    normalizePrivateKey,
    isFirebaseAdminConfigured,
    resetFirebaseAdminForTests,
} = require('../src/firebaseAdmin');
const {
    resolveFirebaseAdminCredentials,
    resetFirebaseAdminCredentialsForTests,
} = require('../src/firebaseAdminCredentials');

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
        NODE_ENV: process.env.NODE_ENV,
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
        FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
    };
    process.env.NODE_ENV = 'test';
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

test('local service account JSON is used when env credentials are missing in development', () => {
    const tmpFile = path.join(os.tmpdir(), `firebase-sa-${process.pid}-${Date.now()}.json`);
    const prev = {
        NODE_ENV: process.env.NODE_ENV,
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
        FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
        FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
        FIREBASE_ALLOW_SERVICE_ACCOUNT_FILE: process.env.FIREBASE_ALLOW_SERVICE_ACCOUNT_FILE,
    };
    fs.writeFileSync(tmpFile, JSON.stringify({
        project_id: 'demo-from-file',
        client_email: 'firebase-adminsdk@demo-from-file.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\\nline\\n-----END PRIVATE KEY-----\\n',
    }), 'utf8');
    process.env.NODE_ENV = 'development';
    process.env.FIREBASE_ALLOW_SERVICE_ACCOUNT_FILE = 'true';
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = tmpFile;
    resetFirebaseAdminForTests();
    resetFirebaseAdminCredentialsForTests();
    try {
        const creds = resolveFirebaseAdminCredentials();
        assert.equal(creds?.source, 'file');
        assert.equal(creds?.projectId, 'demo-from-file');
        assert.equal(isFirebaseAdminConfigured(), true);
    } finally {
        fs.rmSync(tmpFile, { force: true });
        Object.entries(prev).forEach(([key, value]) => {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        });
        resetFirebaseAdminForTests();
        resetFirebaseAdminCredentialsForTests();
    }
});

test('production prefers env credentials and ignores local service account file', () => {
    const tmpFile = path.join(os.tmpdir(), `firebase-sa-prod-${process.pid}-${Date.now()}.json`);
    const prev = {
        NODE_ENV: process.env.NODE_ENV,
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
        FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
        FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    };
    fs.writeFileSync(tmpFile, JSON.stringify({
        project_id: 'should-not-load',
        client_email: 'file-only@example.com',
        private_key: '-----BEGIN PRIVATE KEY-----\\nline\\n-----END PRIVATE KEY-----\\n',
    }), 'utf8');
    process.env.NODE_ENV = 'production';
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = tmpFile;
    resetFirebaseAdminForTests();
    resetFirebaseAdminCredentialsForTests();
    try {
        assert.equal(resolveFirebaseAdminCredentials(), null);
        assert.equal(isFirebaseAdminConfigured(), false);
    } finally {
        fs.rmSync(tmpFile, { force: true });
        Object.entries(prev).forEach(([key, value]) => {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        });
        resetFirebaseAdminForTests();
        resetFirebaseAdminCredentialsForTests();
    }
});
