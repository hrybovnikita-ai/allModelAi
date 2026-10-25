#!/usr/bin/env node
/**
 * Local smoke test: register (or login) through the API without printing secrets.
 * Usage:
 *   node scripts/auth-login-smoke.js
 *   API_BASE=http://127.0.0.1:5173 node scripts/auth-login-smoke.js
 */
const { loadBackendEnv } = require('./load-backend-env');

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:5050').replace(/\/$/, '');

async function postJson(path, body, cookieJar = []) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (cookieJar.length) {
        headers.Cookie = cookieJar.join('; ');
    }
    const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    const setCookie = response.headers.getSetCookie?.() || [];
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: response.status, data, setCookie };
}

async function getJson(path, cookieJar) {
    const response = await fetch(`${API_BASE}${path}`, {
        headers: { Accept: 'application/json', Cookie: cookieJar.join('; ') },
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
}

function mergeCookies(jar, setCookie) {
    for (const line of setCookie) {
        const part = line.split(';')[0];
        const name = part.split('=')[0];
        const next = jar.filter((c) => !c.startsWith(`${name}=`));
        next.push(part);
        jar.length = 0;
        jar.push(...next);
    }
}

async function main() {
    loadBackendEnv();
    const { getDatabaseEngine } = require('../src/db/provider');
    console.log(JSON.stringify({
        phase: 'config',
        apiBase: API_BASE,
        databaseEngine: getDatabaseEngine(),
    }));

    const tag = Date.now();
    const email = `smoke-${tag}@example.com`;
    const password = `SmokeTest${tag}!`.slice(0, 24);

    const jar = [];
    const register = await postJson('/api/auth/register', {
        name: 'Smoke Test',
        email,
        password,
        rememberMe: true,
    }, jar);
    mergeCookies(jar, register.setCookie);
    console.log(JSON.stringify({ phase: 'register', status: register.status, ok: register.status === 201 }));

    const login = await postJson('/api/auth/login', { email, password, rememberMe: true }, jar);
    mergeCookies(jar, login.setCookie);
    console.log(JSON.stringify({
        phase: 'login',
        status: login.status,
        ok: login.status === 200,
        code: login.data?.code || null,
        debugReason: login.data?.debugReason || null,
    }));

    const session = await getJson('/api/auth/session', jar);
    console.log(JSON.stringify({
        phase: 'session',
        status: session.status,
        authenticated: session.data?.authenticated === true,
    }));

    const bad = await postJson('/api/auth/login', { email, password: 'wrong-password-smoke' });
    console.log(JSON.stringify({
        phase: 'bad-password',
        status: bad.status,
        ok: bad.status === 401,
        code: bad.data?.code || null,
    }));

    if (register.status !== 201 || login.status !== 200 || session.data?.authenticated !== true || bad.status !== 401) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
