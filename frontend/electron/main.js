import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, shell, ipcMain, nativeTheme } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.env.ELECTRON_DEV === '1';
const DEFAULT_DEV_PORT = 5173;
const DEV_PORT_FALLBACKS = [5173, 5174, 5175];
const PRODUCTION_LIVE_URL = (
  process.env.ELECTRON_LOAD_URL
  || process.env.ALLMODELAI_ELECTRON_URL
  || 'https://all-model-ai.com/'
).trim();

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {string | null} */
let activeDevServerUrl = null;

function isOAuthOrPaymentUrl(url) {
  const value = String(url || '').toLowerCase();
  return (
    value.includes('accounts.google.com')
    || value.includes('secure.wayforpay.com')
    || value.includes('wayforpay.com')
    || value.includes('firebaseapp.com/__/auth')
    || value.includes('google.com/o/oauth2')
  );
}

function normalizeDevBaseUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  return value.replace(/\/$/, '');
}

function devPortCandidates() {
  const fromEnv = Number(process.env.VITE_DEV_PORT);
  const ports = Number.isFinite(fromEnv) && fromEnv > 0
    ? [fromEnv, ...DEV_PORT_FALLBACKS]
    : [...DEV_PORT_FALLBACKS];
  return [...new Set(ports)];
}

async function isDevServerReady(baseUrl, timeoutMs = 800) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${baseUrl}/`, {
      signal: controller.signal,
      headers: { Accept: 'text/html' },
    });
    clearTimeout(timer);
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

async function resolveDevServerUrl({ maxWaitMs = 90_000 } = {}) {
  const explicit = normalizeDevBaseUrl(
    process.env.VITE_DEV_SERVER_URL
    || process.env.ELECTRON_DEV_URL,
  );
  if (explicit) {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      if (await isDevServerReady(explicit)) return explicit;
      await new Promise((resolve) => { setTimeout(resolve, 400); });
    }
    return explicit;
  }

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    for (const port of devPortCandidates()) {
      const candidate = `http://127.0.0.1:${port}`;
      if (await isDevServerReady(candidate)) return candidate;
    }
    await new Promise((resolve) => { setTimeout(resolve, 400); });
  }

  return `http://127.0.0.1:${DEFAULT_DEV_PORT}`;
}

function attachExternalLinkHandlers(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isOAuthOrPaymentUrl(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (isDev) return;
    if (!isOAuthOrPaymentUrl(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });
}

function attachDevReloadOnFailure(win) {
  if (!isDev) return;

  win.webContents.on('did-fail-load', (_event, errorCode, _description, validatedURL) => {
    if (errorCode === -3) return;
    const failedUrl = String(validatedURL || activeDevServerUrl || '');
    if (!failedUrl.includes('127.0.0.1') && !failedUrl.includes('localhost')) return;

    setTimeout(async () => {
      const nextUrl = await resolveDevServerUrl({ maxWaitMs: 30_000 });
      activeDevServerUrl = nextUrl;
      if (!win.isDestroyed()) {
        await win.loadURL(nextUrl);
      }
    }, 800);
  });
}

async function loadDevServer(win) {
  activeDevServerUrl = await resolveDevServerUrl();
  await win.loadURL(activeDevServerUrl);
}

function resolveProductionLoadTarget() {
  const useLive = process.env.ELECTRON_USE_LIVE_URL === 'true'
    || process.env.ELECTRON_USE_LIVE_URL === '1';
  if (useLive && PRODUCTION_LIVE_URL) {
    return { mode: 'url', target: PRODUCTION_LIVE_URL };
  }
  const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');
  return { mode: 'file', target: indexHtml };
}

async function createMainWindow() {
  nativeTheme.themeSource = 'dark';

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#080b12',
    title: 'AllModelAI',
    autoHideMenuBar: true,
    frame: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 12 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  attachExternalLinkHandlers(mainWindow);
  attachDevReloadOnFailure(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    await loadDevServer(mainWindow);
    if (process.env.ELECTRON_DEVTOOLS !== '0') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    const load = resolveProductionLoadTarget();
    if (load.mode === 'url') {
      await mainWindow.loadURL(load.target);
    } else {
      await mainWindow.loadFile(load.target);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    activeDevServerUrl = null;
  });
}

ipcMain.handle('allmodelai:open-external', (_event, url) => {
  if (!url || typeof url !== 'string') return false;
  shell.openExternal(url);
  return true;
});

app.whenReady().then(async () => {
  await createMainWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
