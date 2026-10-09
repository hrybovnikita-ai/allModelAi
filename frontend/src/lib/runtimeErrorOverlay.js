const OVERLAY_ID = 'allmodelai-runtime-error-overlay';

function formatError(value) {
  if (!value) return 'Unknown error';
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message || value.name || 'Error';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function shouldSuppressAuthOverlay(reason) {
  const message = formatError(reason);
  if (/Google sign-in/i.test(message)) return true;
  if (reason && typeof reason === 'object' && typeof reason.code === 'string') {
    if (reason.code.startsWith('auth/')) return true;
    if (reason.code === 'REDIRECT_RESULT_MISSING') return true;
    if (reason.code.startsWith('AUTH_API_')) return true;
  }
  return false;
}

function showRuntimeErrorBanner(kind, message) {
  if (typeof document === 'undefined') return;
  let box = document.getElementById(OVERLAY_ID);
  if (!box) {
    box = document.createElement('div');
    box.id = OVERLAY_ID;
    box.setAttribute('role', 'alert');
    document.body.appendChild(box);
  }
  const isRejection = kind === 'rejection';
  box.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'z-index:999999',
    `background:${isRejection ? '#7f1d1d' : '#dc2626'}`,
    'color:#fff',
    'padding:16px',
    'font-size:14px',
    'line-height:1.45',
    'word-break:break-word',
    'font-family:system-ui,sans-serif',
  ].join(';');
  const prefix = isRejection ? 'Unhandled Rejection: ' : 'Runtime Error: ';
  box.textContent = `${prefix}${message}`;
}

/** Surfaces fatal JS errors on screen (Safari Private mode debugging). */
export function installRuntimeErrorOverlay() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    showRuntimeErrorBanner('error', formatError(event.error || event.message));
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (shouldSuppressAuthOverlay(event.reason)) {
      event.preventDefault();
      return;
    }
    showRuntimeErrorBanner('rejection', formatError(event.reason));
  });
}
