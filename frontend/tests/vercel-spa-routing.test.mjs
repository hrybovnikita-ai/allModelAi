import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));

test('vercel routes /api to backend before frontend catch-all', () => {
    const rewrites = vercelConfig.rewrites;
    assert.ok(Array.isArray(rewrites) && rewrites.length >= 2);
    assert.match(String(rewrites[0].source), /^\/api\//);
    assert.equal(rewrites[0].destination?.service, 'backend');
    assert.match(String(rewrites[1].source), /\(\.\*\)/);
    assert.equal(rewrites[1].destination?.service, 'frontend');
});

test('frontend service rewrites client routes to index.html for SPA refresh', () => {
    const frontendRewrites = vercelConfig.services?.frontend?.rewrites;
    assert.ok(Array.isArray(frontendRewrites) && frontendRewrites.length >= 1);
    const spaFallback = frontendRewrites.find((rule) => rule.destination === '/index.html');
    assert.ok(spaFallback, 'expected SPA fallback rewrite to /index.html');
    assert.match(String(spaFallback.source), /\(\.\*\)/);
    assert.doesNotMatch(String(spaFallback.source), /api/);
});

test('top-level rewrites do not send /api traffic to index.html', () => {
    for (const rule of vercelConfig.rewrites) {
        const destination = rule.destination;
        if (typeof destination === 'string') {
            assert.notEqual(destination, '/index.html');
        }
        if (destination?.service === 'frontend' && typeof destination.path === 'string') {
            assert.notEqual(destination.path, '/index.html');
        }
    }
});
