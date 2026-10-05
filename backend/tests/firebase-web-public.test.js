const test = require('node:test');
const assert = require('node:assert/strict');
const {
    getPublicFirebaseWebConfig,
    isUsableFirebaseWebValue,
} = require('../src/firebaseWebPublic');

test('firebase web public config rejects placeholders', () => {
    assert.equal(isUsableFirebaseWebValue(''), false);
    assert.equal(isUsableFirebaseWebValue('your-project.firebaseapp.com'), false);
    assert.equal(isUsableFirebaseWebValue('AIzaSyExampleKey123456789'), true);
});

test('getPublicFirebaseWebConfig returns configured payload when env is set', () => {
    const previous = {
        FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
        FIREBASE_WEB_AUTH_DOMAIN: process.env.FIREBASE_WEB_AUTH_DOMAIN,
        FIREBASE_WEB_PROJECT_ID: process.env.FIREBASE_WEB_PROJECT_ID,
        FIREBASE_WEB_APP_ID: process.env.FIREBASE_WEB_APP_ID,
    };
    process.env.FIREBASE_WEB_API_KEY = 'AIzaSyTestKey123456789012345';
    process.env.FIREBASE_WEB_AUTH_DOMAIN = 'demo-allmodelai.firebaseapp.com';
    process.env.FIREBASE_WEB_PROJECT_ID = 'demo-allmodelai';
    process.env.FIREBASE_WEB_APP_ID = '1:123456789:web:abcdef123456';
    try {
        const payload = getPublicFirebaseWebConfig();
        assert.equal(payload.configured, true);
        assert.equal(payload.config.projectId, 'demo-allmodelai');
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});
