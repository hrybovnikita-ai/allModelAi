import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

const savedAppearance = JSON.parse(localStorage.getItem('allmodelai_appearance') || '{}')
document.documentElement.style.setProperty('--user-text-color', savedAppearance.textColor || '#ffffff')
const systemTheme = window.matchMedia('(prefers-color-scheme: light)')
const applyTheme = () => {
  const preference = JSON.parse(localStorage.getItem('allmodelai_appearance') || '{}').theme || 'dark'
  document.documentElement.dataset.themePreference = preference
  document.documentElement.dataset.theme = preference === 'auto' ? (systemTheme.matches ? 'light' : 'dark') : preference
}
applyTheme()
systemTheme.addEventListener('change', applyTheme)

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  window.deferredInstallPrompt = event
})
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
