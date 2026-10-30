import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { createElement as h, act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import Dashboard from '../src/components/Dashboard/Dashboard.jsx';
import { SessionProvider, SessionContext } from '../src/components/Session/SessionProvider.jsx';
import NavAuthSection from '../src/components/Navbar/NavAuthSection.jsx';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clearAllSessionData, rememberSession, SESSION_UPDATED_EVENT } from '../src/lib/session.js';

const frontendRoot = fileURLToPath(new URL('..', import.meta.url));
import { consumeSessionRestoreMeta } from '../src/lib/sessionRestoreMeta.js';

const win = new Window({ url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'localStorage', 'sessionStorage', 'CustomEvent', 'Event']) {
  globalThis[key] = key === 'window' ? win : win[key];
}
for (const key of ['addEventListener', 'removeEventListener', 'dispatchEvent']) globalThis[key] = win[key].bind(win);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
document.cookie = 'allmodelai_cookie_consent=accepted';
const user = { email: 'render@example.com', name: 'Render' };
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

test('Dashboard revalidates a rejected subscription without requesting credits or looping', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const oldFetch = globalThis.fetch;
  const calls = [];
  let refreshes = 0;
  const refresh = async () => { refreshes++; };
  globalThis.fetch = async url => {
    calls.push(String(url));
    return String(url).includes('/subscription')
      ? Response.json({}, { status: 401 }) : Response.json({});
  };
  try {
    const value = { user, status: 'authenticated', sessionVerified: true, authLoading: false, refresh };
    await act(async () => {
      root.render(h(SessionContext.Provider, { value }, h(MemoryRouter, { initialEntries: ['/dashboard'] },
        h(Routes, null, h(Route, { element: h(Outlet, { context: { user, sessionVerified: true, retrySession: refresh } }) },
          h(Route, { path: '/dashboard', element: h(Dashboard) }))))));
      await settle();
    });
    await act(async () => { await settle(); });
    assert.equal(calls.filter(url => url.includes('/subscription')).length, 1);
    assert.equal(calls.filter(url => url.includes('/credits')).length, 0);
    assert.equal(refreshes, 1);
    assert.match(container.textContent, /session could not be verified/);
  } finally {
    act(() => root.unmount());
    globalThis.fetch = oldFetch;
  }
});

test('Navbar ignores cached-profile events and logout immediately removes authenticated navigation', async () => {
  clearAllSessionData();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let valid = false;
  globalThis.fetch = async () => Response.json(valid ? { user, authenticated: true } : { user: null, authenticated: false });
  await act(async () => {
    root.render(h(MemoryRouter, null, h(SessionProvider, null, h(NavAuthSection, { onOpenAuth() {} }))));
    await settle();
  });
  await act(async () => {
    rememberSession(user, { serverVerified: false });
    consumeSessionRestoreMeta();
    globalThis.dispatchEvent(new CustomEvent(SESSION_UPDATED_EVENT, { detail: { user: { ...user } } }));
    await settle();
  });
  assert.equal(container.querySelector('.nav-user-dashboard'), null);
  valid = true;
  await act(async () => {
    globalThis.dispatchEvent(new Event('focus'));
    await settle();
  });
  assert.ok(container.querySelector('.nav-user-dashboard'));
  let finishLogout;
  globalThis.fetch = () => new Promise(resolve => { finishLogout = resolve; });
  await act(async () => { container.querySelector('.nav-signout').click(); await settle(); });
  assert.equal(container.querySelector('.nav-user-dashboard'), null);
  await act(async () => { finishLogout(new Response(null, { status: 204 })); await settle(); });
  act(() => root.unmount());
  container.remove();
});

test('RequireAuth waits for forced refresh before rendering protected shell', () => {
  const src = readFileSync(`${frontendRoot}src/components/Login/RequireAuth.jsx`, 'utf8');
  assert.match(src, /refresh\(\{ force: true \}\)/);
  assert.match(src, /canRenderProtectedShell/);
  assert.match(src, /sessionVerified/);
  assert.match(src, /checkedPath === location\.pathname/);
});
