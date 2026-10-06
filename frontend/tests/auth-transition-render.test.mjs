import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { Window } from 'happy-dom';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { SessionContext } from '../src/components/Session/SessionProvider.jsx';
import CommandPalette from '../src/components/CommandPalette/CommandPalette.jsx';

const happyWindow = new Window();
globalThis.window = happyWindow;
globalThis.document = happyWindow.document;
globalThis.HTMLElement = happyWindow.HTMLElement;
globalThis.customElements = happyWindow.customElements;

const hookErrors = [];

function installHookErrorListener() {
  const previous = console.error;
  console.error = (...args) => {
    const text = args.map((arg) => (typeof arg === 'string' ? arg : arg?.message || '')).join(' ');
    if (/hooks|Rendered more hooks|Rendered fewer hooks|order of Hooks/i.test(text)) {
      hookErrors.push(text);
    }
    previous(...args);
  };
  return () => {
    console.error = previous;
  };
}

function renderCommandPalette(sessionValue) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const tree = createElement(
    SessionContext.Provider,
    { value: sessionValue },
    createElement(MemoryRouter, null, createElement(CommandPalette)),
  );

  act(() => {
    root.render(tree);
  });

  return {
    rerender(nextValue) {
      act(() => {
        root.render(
          createElement(
            SessionContext.Provider,
            { value: nextValue },
            createElement(MemoryRouter, null, createElement(CommandPalette)),
          ),
        );
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const anonymousSession = {
  status: 'anonymous',
  user: null,
  authLoading: false,
  refresh: async () => null,
};

const loadingSession = {
  status: 'loading',
  user: null,
  authLoading: true,
  refresh: async () => null,
};

const authenticatedSession = {
  status: 'authenticated',
  user: { email: 'user@example.com', name: 'User' },
  authLoading: false,
  refresh: async () => null,
};

let restoreConsole;

afterEach(() => {
  restoreConsole?.();
  restoreConsole = undefined;
  hookErrors.length = 0;
});

test('CommandPalette auth transitions do not violate hook order', () => {
  restoreConsole = installHookErrorListener();

  const view = renderCommandPalette(loadingSession);
  view.rerender(anonymousSession);
  view.rerender(loadingSession);
  view.rerender(authenticatedSession);
  view.rerender(authenticatedSession);
  view.rerender(anonymousSession);
  view.rerender(authenticatedSession);
  view.unmount();

  assert.equal(hookErrors.length, 0, hookErrors.join('\n'));
});

test('CommandPalette gate keeps hooks before conditional return', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../src/components/CommandPalette/CommandPalette.jsx', import.meta.url),
    'utf8',
  );
  const gateStart = source.indexOf('export default function CommandPalette()');
  assert.ok(gateStart >= 0);
  const gateBody = source.slice(gateStart);
  const returnNullIdx = gateBody.indexOf('if (!paletteAllowed)');
  assert.ok(returnNullIdx > 0);
  const beforeGuard = gateBody.slice(0, returnNullIdx);
  assert.doesNotMatch(beforeGuard, /useEffect\(/);
  assert.doesNotMatch(beforeGuard, /useMemo\(/);
  assert.match(beforeGuard, /useSession\(/);
});
