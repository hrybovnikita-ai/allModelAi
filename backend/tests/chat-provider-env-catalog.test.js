const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHAT_PROVIDER_ENV } = require('../src/chatProviderRuntime');

test('documented chat provider env keys exist in backend source references', () => {
    const srcRoot = path.join(__dirname, '..', 'src');
    const files = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js')) files.push(full);
        }
    };
    walk(srcRoot);
    const corpus = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    for (const [providerId, spec] of Object.entries(CHAT_PROVIDER_ENV)) {
        for (const key of spec.keys) {
            assert.match(corpus, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${providerId} key ${key} should be referenced in backend src`);
        }
    }
});
