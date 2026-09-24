const STORAGE_KEY = 'allmodelai_debug_logs';
const PREFIX = '[AllModelAI]';

const SENSITIVE_KEY = /^(password|token|secret|authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|session|credential|bearer)$/i;
const SENSITIVE_VALUE = /^(Bearer\s+|amai_|sk-|ghp_|eyJ[A-Za-z0-9_-]+\.eyJ)/i;

export const isLoggerEnabled = () => {
  if (typeof window !== 'undefined') {
    const override = window.localStorage?.getItem(STORAGE_KEY);
    if (override === '0') return false;
    if (override === '1') return true;
  }
  return Boolean(import.meta.env?.DEV);
};

const timestamp = () => new Date().toLocaleTimeString(undefined, { hour12: false });

export const timingNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
export const timingElapsed = (startedAt) => Math.round(timingNow() - startedAt);

const sanitizeValue = (value, depth = 0) => {
  if (value == null || depth > 4) return value;
  if (typeof value === 'string') {
    if (SENSITIVE_VALUE.test(value)) return '[redacted]';
    if (value.startsWith('data:image/') || value.startsWith('data:application/')) return `[data-url ${value.slice(5, 20)}…]`;
    return value.length > 240 ? `${value.slice(0, 240)}…` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === 'object') {
    const next = {};
    Object.entries(value).forEach(([key, item]) => {
      if (SENSITIVE_KEY.test(key)) {
        next[key] = '[redacted]';
        return;
      }
      next[key] = sanitizeValue(item, depth + 1);
    });
    return next;
  }
  return value;
};

const write = (level, category, message, meta) => {
  if (!isLoggerEnabled() && level !== 'error') return;
  const label = `${PREFIX} [${category}] ${message}`;
  const payload = meta === undefined ? undefined : sanitizeValue(meta);
  const time = timestamp();
  const line = `${label} · ${time}`;
  if (level === 'error') {
    if (payload !== undefined) console.error(line, payload);
    else console.error(line);
    return;
  }
  if (level === 'warn') {
    if (payload !== undefined) console.warn(line, payload);
    else console.warn(line);
    return;
  }
  if (payload !== undefined) console.log(line, payload);
  else console.log(line);
};

export const logger = {
  info(message, meta) { write('info', 'INFO', message, meta); },
  success(message, meta) { write('info', 'SUCCESS', message, meta); },
  warn(message, meta) { write('warn', 'WARN', message, meta); },
  error(message, meta) { write('error', 'ERROR', message, meta); },
  action(message, meta) { write('info', 'ACTION', message, meta); },
  chat(message, meta) { write('info', 'CHAT', message, meta); },
  api(message, meta) { write('info', 'API', message, meta); },
  apiError(message, meta) { write('error', 'API ERROR', message, meta); },
  router(message, meta) { write('info', 'ROUTER', message, meta); },
  search(message, meta) { write('info', 'SEARCH', `🌐 ${message}`, meta); },
  searchSuccess(message, meta) { write('info', 'SEARCH', `✅ ${message}`, meta); },
  searchError(message, meta) { write('error', 'SEARCH', `❌ ${message}`, meta); },

  group(title, fn) {
    if (!isLoggerEnabled()) return fn?.();
    console.groupCollapsed(title);
    try {
      return fn?.();
    } finally {
      console.groupEnd();
    }
  },

  async groupAsync(title, fn) {
    if (!isLoggerEnabled()) return fn?.();
    console.groupCollapsed(title);
    try {
      return await fn?.();
    } finally {
      console.groupEnd();
    }
  },

  enable() {
    window.localStorage?.setItem(STORAGE_KEY, '1');
    console.log(`${PREFIX} Debug logging enabled (localStorage override).`);
  },

  disable() {
    window.localStorage?.setItem(STORAGE_KEY, '0');
    console.log(`${PREFIX} Debug logging disabled (localStorage override).`);
  },

  reset() {
    window.localStorage?.removeItem(STORAGE_KEY);
    console.log(`${PREFIX} Debug logging reset to environment default (DEV=${Boolean(import.meta.env?.DEV)}).`);
  },
};

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__allModelAiLogger = logger;
}
