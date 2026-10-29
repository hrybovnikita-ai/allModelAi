import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { SessionProvider } from './components/Session/SessionProvider.jsx';
import RouteErrorBoundary from './components/ErrorBoundary/RouteErrorBoundary.jsx';
import { applyDeviceProfile } from './lib/deviceProfile.js';
import { initPlatformShell } from './lib/platformBootstrap.js';
import { isElectronShell } from './lib/nativePlatform.js';
import { startBackendHealthCheck } from './lib/backendHealthCheck.js';
import { initPwaInstallPrompt } from './lib/pwaInstall.js';
import { initServiceWorker } from './lib/serviceWorker.js';

function readAppearance() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('allmodelai_appearance') : null;
    return JSON.parse(raw || '{}') || {};
  } catch {
    return {};
  }
}

function applyAppearanceTheme() {
  const savedAppearance = readAppearance();
  const savedMessageColor = !savedAppearance.textColor || savedAppearance.textColor.toLowerCase() === '#ffffff'
    ? '#8b5cf6'
    : savedAppearance.textColor;
  const colorValue = savedMessageColor.replace('#', '');
  const colorChannels = [0, 2, 4].map((index) => Number.parseInt(colorValue.slice(index, index + 2), 16));
  document.documentElement.style.setProperty('--user-text-color', savedMessageColor);
  document.documentElement.style.setProperty(
    '--user-bubble-text',
    (colorChannels[0] * 299 + colorChannels[1] * 587 + colorChannels[2] * 114) / 1000 > 155 ? '#111111' : '#ffffff',
  );
  const savedInputColor = savedAppearance.inputColor || '#262626';
  document.documentElement.style.setProperty('--composer-color', savedInputColor);
  document.documentElement.style.setProperty('--composer-text', '#ffffff');
  if (savedAppearance.aiTextColor) document.documentElement.style.setProperty('--ai-text-color', savedAppearance.aiTextColor);
  if (savedAppearance.chatBackground) document.documentElement.style.setProperty('--chat-canvas', savedAppearance.chatBackground);
  if (savedAppearance.lineHeight) document.documentElement.style.setProperty('--chat-line-height', String(savedAppearance.lineHeight));
  if (savedAppearance.codeTheme) document.documentElement.dataset.codeTheme = savedAppearance.codeTheme;
  if (savedAppearance.fontSize) document.documentElement.style.setProperty('--chat-font-size', `${savedAppearance.fontSize}px`);

  const systemTheme = window.matchMedia('(prefers-color-scheme: light)');
  const applyTheme = () => {
    const preference = readAppearance().theme || 'dark';
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.dataset.theme = preference === 'auto'
      ? (systemTheme.matches ? 'light' : 'dark')
      : preference;
  };
  applyTheme();
  systemTheme.addEventListener('change', applyTheme);
}

export function startAllModelAIApp() {
  applyAppearanceTheme();
  applyDeviceProfile();
  initPlatformShell();
  initPwaInstallPrompt();
  void initServiceWorker();

  if (isElectronShell()) {
    startBackendHealthCheck({ attempts: 6, intervalMs: 2500 });
  }

  const AppRouter = isElectronShell() ? HashRouter : BrowserRouter;
  const mount = document.getElementById('root');
  if (!mount) {
    throw new Error('Root element #root was not found.');
  }

  createRoot(mount).render(
    <StrictMode>
      <AppRouter>
        <RouteErrorBoundary>
          <SessionProvider>
            <App />
          </SessionProvider>
        </RouteErrorBoundary>
      </AppRouter>
    </StrictMode>,
  );
}
