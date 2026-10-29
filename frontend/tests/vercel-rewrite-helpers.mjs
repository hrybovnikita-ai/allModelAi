import assert from 'node:assert/strict';

const FIREBASE_AUTH_DEST = 'https://allmodelai.firebaseapp.com/__/auth';
const API_DEST = 'https://allmodelai-backend.onrender.com/api/:path*';

/**
 * Production rewrites: exact /__/auth, /__/auth/:path*, /api/:path*, then SPA — order may vary among the first three.
 */
export function assertAllModelAiVercelRewrites(vercelConfig, label) {
  const rewrites = vercelConfig.rewrites;
  assert.ok(Array.isArray(rewrites) && rewrites.length >= 4, `${label}: expected rewrites array`);

  const spaIndex = rewrites.findIndex((rule) => rule.destination === '/index.html');
  assert.ok(spaIndex >= 0, `${label}: expected SPA fallback`);
  assert.equal(spaIndex, rewrites.length - 1, `${label}: SPA catch-all must be last`);

  const authExact = rewrites.find(
    (rule) => rule.source === '/__/auth' && rule.destination === FIREBASE_AUTH_DEST,
  );
  const authWildcard = rewrites.find(
    (rule) => rule.source === '/__/auth/:path*' && rule.destination === `${FIREBASE_AUTH_DEST}/:path*`,
  );
  const apiRule = rewrites.find((rule) => rule.source === '/api/:path*' && rule.destination === API_DEST);

  assert.ok(authExact, `${label}: expected exact /__/auth Firebase proxy`);
  assert.ok(authWildcard, `${label}: expected /__/auth/:path* Firebase proxy`);
  assert.ok(apiRule, `${label}: expected /api/:path* proxy`);

  for (const rule of [authExact, authWildcard, apiRule]) {
    assert.ok(rewrites.indexOf(rule) < spaIndex, `${label}: proxy rules must precede SPA`);
  }

  const spaRule = rewrites[spaIndex];
  assert.doesNotMatch(String(spaRule.source), /^\/?api/);
  assert.doesNotMatch(String(spaRule.source), /__\/auth/);
}

export function assertExternalProxyPathSyntax(vercelConfig) {
  const external = vercelConfig.rewrites.filter((rule) => String(rule.destination).startsWith('https://'));
  assert.ok(external.length >= 3);
  for (const rule of external) {
    if (rule.source === '/__/auth') {
      assert.equal(rule.destination, FIREBASE_AUTH_DEST);
      continue;
    }
    assert.match(String(rule.source), /:path\*$/);
    assert.match(String(rule.destination), /:path\*$/);
  }
}
