import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { createElement as h, act } from 'react';

const win = new Window({ url: 'http://localhost/settings' });
for (const key of ['window', 'document', 'HTMLElement', 'localStorage', 'sessionStorage', 'CustomEvent', 'Event']) {
  globalThis[key] = key === 'window' ? win : win[key];
}
for (const key of ['addEventListener', 'removeEventListener', 'dispatchEvent']) globalThis[key] = win[key].bind(win);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
document.cookie = 'allmodelai_cookie_consent=accepted';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Settings from '../src/components/Settings/Settings.jsx';
import RequireAuth from '../src/components/Login/RequireAuth.jsx';
import { SessionContext } from '../src/components/Session/SessionProvider.jsx';
import { rememberSession } from '../src/lib/session.js';

const user = { email: 'settings@test.com', name: 'Test User', avatar: '' };

function renderSettings() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const session = {
    user,
    status: 'authenticated',
    sessionVerified: true,
    authLoading: false,
    refresh: async () => {},
    connectionIssue: null,
  };
  const tree = h(
    SessionContext.Provider,
    { value: session },
    h(
      MemoryRouter,
      { initialEntries: ['/settings'] },
      h(
        Routes,
        null,
        h(Route, {
          path: '/settings',
          element: h(Settings),
        }),
      ),
    ),
  );
  return { container, root, tree };
}

test('Settings page renders with corrupt language profile', async () => {
  localStorage.setItem('allmodelai_language', '{"bad":true}');
  localStorage.setItem('allmodelai_profile', '{"language":123}');
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.includes('chat-settings')) {
      return new Response(JSON.stringify({ uiLanguage: 'Russian', responseLanguage: 'auto' }), { status: 200 });
    }
    if (path.includes('connections')) {
      return new Response(JSON.stringify({ providers: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };
  const { container, root, tree } = renderSettings();
  await act(async () => {
    root.render(tree);
    await new Promise((r) => setTimeout(r, 80));
  });
  assert.ok(container.querySelector('.settings-page'));
  await act(async () => root.unmount());
  container.remove();
});

test('Settings page renders without crashing', async () => {
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.includes('/api/storage/ideas/chat-settings')) {
      return new Response(JSON.stringify({ responseLanguage: 'auto', uiLanguage: 'English' }), { status: 200 });
    }
    if (path.includes('/api/auth/connections')) {
      return new Response(JSON.stringify({ providers: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };
  const { container, root, tree } = renderSettings();
  await act(async () => {
    root.render(tree);
    await new Promise((r) => setTimeout(r, 50));
  });
  assert.ok(container.querySelector('.settings-page'), 'settings shell should render');
  assert.ok(container.querySelector('#settings-general'), 'general section should render');
  await act(async () => root.unmount());
  container.remove();
});

test('Settings route inside RequireAuth shell renders', async () => {
  rememberSession(user);
  let refreshCalls = 0;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.includes('chat-settings')) {
      return new Response(JSON.stringify({ responseLanguage: 'auto' }), { status: 200 });
    }
    if (path.includes('connections')) {
      return new Response(JSON.stringify({ providers: [] }), { status: 200 });
    }
    if (path.includes('/api/credits')) {
      return new Response(JSON.stringify({ mode: 'user', remaining: 10 }), { status: 200 });
    }
    if (path.includes('/api/auth/account/security')) {
      return new Response(JSON.stringify({ passwordEnabled: true, providers: [], email: user.email }), { status: 200 });
    }
    if (path.includes('/api/platform/capabilities')) {
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    }
    if (path.includes('/api/ai/')) {
      return new Response(JSON.stringify({ memoryEnabled: false, items: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const session = {
    user,
    status: 'authenticated',
    sessionVerified: true,
    authLoading: false,
    refresh: async () => {
      refreshCalls += 1;
    },
    connectionIssue: null,
  };
  const tree = h(
    SessionContext.Provider,
    { value: session },
    h(
      MemoryRouter,
      { initialEntries: ['/settings'] },
      h(
        Routes,
        null,
        h(
          Route,
          { element: h(RequireAuth) },
          h(Route, { path: '/settings', element: h(Settings) }),
        ),
      ),
    ),
  );
  await act(async () => {
    root.render(tree);
    await new Promise((r) => setTimeout(r, 150));
  });
  assert.ok(container.querySelector('.settings-page'), 'settings should render in auth shell');
  assert.equal(refreshCalls, 1, 'RequireAuth should refresh session once on mount');
  assert.ok(!container.textContent.includes('Something went wrong'));
  await act(async () => root.unmount());
  container.remove();
});
