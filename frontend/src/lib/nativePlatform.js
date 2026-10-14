import { isCapacitorNative, getCapacitorPlatform, isElectronShell } from './apiBase.js';

export { isElectronShell };

export function getNativeShell() {
  if (isElectronShell()) return 'electron';
  if (isCapacitorNative()) return getCapacitorPlatform();
  return 'web';
}

export function isNativeMultiplatformShell() {
  const shell = getNativeShell();
  return shell === 'electron' || shell === 'ios' || shell === 'android';
}

export async function openExternalUrl(url) {
  const target = String(url || '').trim();
  if (!target) return false;

  if (isElectronShell() && typeof window.allmodelai?.openExternal === 'function') {
    return window.allmodelai.openExternal(target);
  }

  if (isCapacitorNative()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({
        url: target,
        presentationStyle: 'popover',
        toolbarColor: '#080b12',
      });
      return true;
    } catch {
      /* fall through */
    }
  }

  const opened = window.open(target, '_blank', 'noopener,noreferrer');
  return Boolean(opened);
}

/**
 * WayForPay requires POST — in WebView we submit in-place; on Electron open hosted checkout in system browser when possible.
 */
export async function submitHostedPaymentForm({ payUrl, fields, openInSystemBrowser = false }) {
  if (!payUrl || !fields) throw new Error('Payment form payload is incomplete.');

  if (openInSystemBrowser && isElectronShell()) {
    await openExternalUrl(payUrl);
    return;
  }

  if (isCapacitorNative() && openInSystemBrowser) {
    const { Browser } = await import('@capacitor/browser');
    const html = buildAutoPostHtml(payUrl, fields);
    await Browser.open({
      url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
      presentationStyle: 'fullscreen',
      toolbarColor: '#080b12',
    });
    return;
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = payUrl;
  form.acceptCharset = 'UTF-8';
  form.style.display = 'none';

  const appendField = (name, value) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  };

  Object.entries(fields).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => appendField(`${key}[]`, item));
    } else {
      appendField(key, value);
    }
  });

  document.body.appendChild(form);
  form.submit();
}

function buildAutoPostHtml(payUrl, fields) {
  const inputs = Object.entries(fields).flatMap(([key, value]) => {
    if (Array.isArray(value)) {
      return value.map((item) => `<input type="hidden" name="${escapeHtml(`${key}[]`)}" value="${escapeHtml(String(item))}" />`);
    }
    return [`<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(String(value))}" />`];
  }).join('');
  return `<!doctype html><html><body style="margin:0;background:#080b12;color:#e2e8f0;font-family:system-ui;display:grid;place-items:center;height:100vh"><p>Opening secure checkout…</p><form id="f" method="POST" action="${escapeHtml(payUrl)}" accept-charset="UTF-8">${inputs}</form><script>document.getElementById('f').submit()</script></body></html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
