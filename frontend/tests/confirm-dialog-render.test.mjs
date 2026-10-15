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

function Host({
  title = 'Delete chat?',
  description = 'This will permanently delete "Hello". This action cannot be undone.',
  onConfirm,
}) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(0);
  const [cancelled, setCancelled] = useState(0);

  return createElement(
    'div',
    null,
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'trigger-delete',
        onClick: () => {
          setError('');
          setOpen(true);
        },
      },
      'Delete',
    ),
    createElement('span', { 'data-testid': 'confirm-count' }, String(confirmed)),
    createElement('span', { 'data-testid': 'cancel-count' }, String(cancelled)),
    open
      ? createElement(ConfirmDialog, {
          open: true,
          title,
          description,
          confirmLabel: 'Delete chat',
          cancelLabel: 'Cancel',
          destructive: true,
          loading,
          error,
          onConfirm: async () => {
            if (loading) return;
            setLoading(true);
            try {
              await onConfirm?.();
              setConfirmed((n) => n + 1);
              setOpen(false);
            } catch (err) {
              setError(err.message || 'failed');
            } finally {
              setLoading(false);
            }
          },
          onCancel: () => {
            if (loading) return;
            setCancelled((n) => n + 1);
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
    root.render(createElement(Host, props));
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
      document.body.innerHTML = '';
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

test('modal shows title and conversation name', () => {
  const view = renderHost();
  const dialog = document.querySelector('[role="alertdialog"]');
  assert.ok(dialog);
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.match(dialog.textContent, /Delete chat\?/);
  assert.match(dialog.textContent, /Hello/);
  view.unmount();
});

test('Cancel and X dismiss without confirming', () => {
  let confirmed = 0;
  const view = renderHost({
    onConfirm: async () => {
      confirmed += 1;
    },
  });
  const cancel = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancel');
  act(() => cancel.click());
  assert.equal(confirmed, 0);
  assert.equal(document.querySelector('[role="alertdialog"]'), null);
  assert.equal(view.container.querySelector('[data-testid="cancel-count"]').textContent, '1');

  act(() => view.container.querySelector('[data-testid="trigger-delete"]').click());
  const close = document.querySelector('.confirm-dialog-close');
  act(() => close.click());
  assert.equal(confirmed, 0);
  assert.equal(document.querySelector('[role="alertdialog"]'), null);
  view.unmount();
});

test('Escape dismisses the dialog', () => {
  const view = renderHost();
  act(() => {
    document.dispatchEvent(new happyWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  assert.equal(document.querySelector('[role="alertdialog"]'), null);
  assert.equal(view.container.querySelector('[data-testid="cancel-count"]').textContent, '1');
  view.unmount();
});

test('confirm triggers once when double-clicked', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const view = renderHost({
    onConfirm: async () => {
      calls += 1;
      await gate;
    },
  });
  const confirm = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Delete chat');
  act(() => {
    confirm.click();
    confirm.click();
  });
  assert.equal(calls, 1);
  assert.match(confirm.textContent, /Deleting/);
  await act(async () => {
    release();
    await Promise.resolve();
  });
  assert.equal(view.container.querySelector('[data-testid="confirm-count"]').textContent, '1');
  assert.equal(document.querySelector('[role="alertdialog"]'), null);
  view.unmount();
});

test('failed deletion preserves dialog and shows error', async () => {
  const view = renderHost({
    onConfirm: async () => {
      throw new Error('Network failed');
    },
  });
  const confirm = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Delete chat');
  await act(async () => {
    confirm.click();
    await Promise.resolve();
  });
  assert.ok(document.querySelector('[role="alertdialog"]'));
  assert.match(document.querySelector('[role="alert"]')?.textContent || '', /Network failed/);
  assert.equal(view.container.querySelector('[data-testid="confirm-count"]').textContent, '0');
  view.unmount();
});
