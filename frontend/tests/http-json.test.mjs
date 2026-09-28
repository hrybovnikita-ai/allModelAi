import assert from 'node:assert/strict';
import test from 'node:test';
import { readJsonBody } from '../src/lib/httpJson.js';

test('readJsonBody rejects HTML error pages with a clear message', async () => {
  const response = new Response('<!doctype html><html></html>', {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
  const { parseError } = await readJsonBody(response);
  assert.ok(parseError);
  assert.match(parseError.message, /web page instead of API data|Authentication API was not found/i);
});

test('readJsonBody parses JSON responses', async () => {
  const response = new Response(JSON.stringify({ message: 'Incorrect email or password' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
  const { data, parseError } = await readJsonBody(response);
  assert.equal(parseError, null);
  assert.equal(data.message, 'Incorrect email or password');
});
