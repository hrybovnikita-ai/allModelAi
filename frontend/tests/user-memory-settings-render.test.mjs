import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { Window } from 'happy-dom';
import { createElement, act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ConfirmDialog from '../src/components/ConfirmDialog/ConfirmDialog.jsx';

const happyWindow = new Window();
globalThis.window = happyWindow;
globalThis.document = happyWindow.document;
globalThis.HTMLElement = happyWindow.HTMLElement;
globalThis.customElements = happyWindow.customElements;
globalThis.Node = happyWindow.Node;
globalThis.DocumentFragment = happyWindow.DocumentFragment;

function ClearAllHost({ onConfirm }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cleared, setCleared] = useState(0);

  return createElement(
    'div',
    null,
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'clear-all',
        onClick: () => {
          setError('');
          setOpen(true);
        },
      },
      'Clear all memories',
    ),
    createElement('span', { 'data-testid': 'cleared-count' }, String(cleared)),
    open
      ? createElement(ConfirmDialog, {
          open: true,
          title: 'Clear all memories?',
          description: 'This permanently deletes every AI memory saved to your account.',
          confirmLabel: 'Clear all',
          cancelLabel: 'Cancel',
          destructive: true,
          loading,
          error,
          onConfirm: async () => {
            if (loading) return;
            setLoading(true);
            try {
              await onConfirm?.();
              setCleared((n) => n + 1);
              setOpen(false);
            } catch (err) {
              setError(err.message || 'failed');
            } finally {
              setLoading(false);
            }
          },
          onCancel: () => {
            if (loading) return;
            setOpen(false);
          },
        })
      : null,
  );
}

function renderHost(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(ClearAllHost, props));
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

test('Clear all memories confirmation dialog confirms and surfaces errors', async () => {
  let shouldFail = false;
  const { container, unmount } = renderHost({
    onConfirm: async () => {
      if (shouldFail) throw new Error('Clear failed');
    },
  });

  const trigger = container.querySelector('[data-testid="clear-all"]');
  assert.ok(trigger);

  await act(async () => {
    trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });

  const dialog = document.querySelector('[role="alertdialog"]');
  assert.ok(dialog);
  assert.match(dialog.textContent, /Clear all memories\?/);

  shouldFail = true;
  const confirmBtn = [...document.querySelectorAll('button')].find((btn) => btn.textContent === 'Clear all');
  assert.ok(confirmBtn);
  await act(async () => {
    confirmBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  assert.match(document.querySelector('.confirm-dialog-error')?.textContent || '', /Clear failed/);
  assert.equal(container.querySelector('[data-testid="cleared-count"]')?.textContent, '0');

  shouldFail = false;
  await act(async () => {
    confirmBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  assert.equal(container.querySelector('[data-testid="cleared-count"]')?.textContent, '1');
  assert.equal(document.querySelector('[role="alertdialog"]'), null);

  unmount();
});
