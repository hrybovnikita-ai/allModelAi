import { installRuntimeErrorOverlay } from './lib/runtimeErrorOverlay.js'
import { installHooksDevDiagnostics } from './lib/hooksDevDiagnostics.js'

installRuntimeErrorOverlay()
installHooksDevDiagnostics()

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './styles/design-system.css'
import './styles/premium-ui.css'
import './styles/home-premium.css'
import './styles/style.css'
import App from './App.jsx'
import { SessionProvider } from './components/Session/SessionProvider.jsx'
import RouteErrorBoundary from './components/ErrorBoundary/RouteErrorBoundary.jsx'
import { applyDeviceProfile } from './lib/deviceProfile.js'
import { installNativeFetchInterceptor } from './lib/nativeFetch.js'
import { initPwaInstallPrompt } from './lib/pwaInstall.js'
import { initServiceWorker } from './lib/serviceWorker.js'
import { startRedirectPrerequisitesPreload } from './lib/authRedirectPreload.js'
import { ensureSocialAuthReady } from './lib/firebase.js'
import { isGoogleRedirectRecoveryPending, reconcileStaleRedirectIntent } from './lib/socialRedirectState.js'

installNativeFetchInterceptor()
void startRedirectPrerequisitesPreload().catch(() => {
  /* Redirect gate surfaces recovery errors. */
})
void ensureSocialAuthReady().catch(() => {})
void Promise.resolve().then(() => {
  if (!isGoogleRedirectRecoveryPending()) {
    reconcileStaleRedirectIntent();
  }
})

function readAppearance() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('allmodelai_appearance') : null;
    return JSON.parse(raw || '{}') || {};
  } catch {
    return {};
  }
}
const savedAppearance = readAppearance()
const savedMessageColor = !savedAppearance.textColor || savedAppearance.textColor.toLowerCase() === '#ffffff' ? '#8b5cf6' : savedAppearance.textColor
const colorValue = savedMessageColor.replace('#', '')
const colorChannels = [0, 2, 4].map(index => Number.parseInt(colorValue.slice(index, index + 2), 16))
document.documentElement.style.setProperty('--user-text-color', savedMessageColor)
document.documentElement.style.setProperty('--user-bubble-text', (colorChannels[0] * 299 + colorChannels[1] * 587 + colorChannels[2] * 114) / 1000 > 155 ? '#111111' : '#ffffff')
const savedInputColor = savedAppearance.inputColor || '#262626'
//const inputValue = savedInputColor.replace('#', '')
// const inputChannels = [0, 2, 4].map(index => Number.parseInt(inputValue.slice(index, index + 2), 16))
document.documentElement.style.setProperty('--composer-color', savedInputColor)
// Chat composer surface is dark (Dark Violet) — typed text must stay light regardless of input swatch.
document.documentElement.style.setProperty('--composer-text', '#ffffff')
const systemTheme = window.matchMedia('(prefers-color-scheme: light)')
const applyTheme = () => {
  const preference = readAppearance().theme || 'dark'
  document.documentElement.dataset.themePreference = preference
  document.documentElement.dataset.theme = preference === 'auto' ? (systemTheme.matches ? 'light' : 'dark') : preference
}
applyTheme()
systemTheme.addEventListener('change', applyTheme)
applyDeviceProfile()

initPwaInstallPrompt()
void initServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <RouteErrorBoundary>
        <SessionProvider>
          <App />
        </SessionProvider>
      </RouteErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
