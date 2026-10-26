'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shouldExposeAccountTokenInResponse } = require('../src/accountTokenExposure');

test('exposes tokens in test environment', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
        assert.equal(shouldExposeAccountTokenInResponse({ emailDeliveryConfigured: true }), true);
    } finally {
        process.env.NODE_ENV = previous;
    }
});

test('exposes tokens locally when email delivery is off unless explicitly disabled', () => {
    const previousEnv = process.env.NODE_ENV;
    const previousExpose = process.env.EXPOSE_ACCOUNT_TOKENS;
    process.env.NODE_ENV = 'development';
    delete process.env.EXPOSE_ACCOUNT_TOKENS;
    try {
        assert.equal(shouldExposeAccountTokenInResponse({ emailDeliveryConfigured: false }), true);
        process.env.EXPOSE_ACCOUNT_TOKENS = 'false';
        assert.equal(shouldExposeAccountTokenInResponse({ emailDeliveryConfigured: false }), false);
    } finally {
        process.env.NODE_ENV = previousEnv;
        if (previousExpose === undefined) delete process.env.EXPOSE_ACCOUNT_TOKENS;
        else process.env.EXPOSE_ACCOUNT_TOKENS = previousExpose;
    }
});

test('never exposes tokens in production without explicit opt-in', () => {
    const previousEnv = process.env.NODE_ENV;
    const previousExpose = process.env.EXPOSE_ACCOUNT_TOKENS;
    process.env.NODE_ENV = 'production';
    delete process.env.EXPOSE_ACCOUNT_TOKENS;
    try {
        assert.equal(shouldExposeAccountTokenInResponse({ emailDeliveryConfigured: false }), false);
        process.env.EXPOSE_ACCOUNT_TOKENS = 'true';
        assert.equal(shouldExposeAccountTokenInResponse({ emailDeliveryConfigured: false }), true);
    } finally {
        process.env.NODE_ENV = previousEnv;
        if (previousExpose === undefined) delete process.env.EXPOSE_ACCOUNT_TOKENS;
        else process.env.EXPOSE_ACCOUNT_TOKENS = previousExpose;
    }
});
