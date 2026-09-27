import { isStandaloneApp } from './appMode.js'

/** @type {BeforeInstallPromptEvent | null} */
let deferredPrompt = null
const listeners = new Set()

function notify() {
  listeners.forEach((fn) => fn(canShowInstallPrompt()))
}

/**
 * @returns {boolean}
 */
export function canShowInstallPrompt() {
  if (isStandaloneApp()) return false
  return Boolean(deferredPrompt)
}

export function subscribeInstallPrompt(listener) {
  listeners.add(listener)
  listener(canShowInstallPrompt())
  return () => listeners.delete(listener)
}

export function initPwaInstallPrompt() {
  if (typeof window === 'undefined') return

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event
    window.deferredInstallPrompt = event
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    window.deferredInstallPrompt = null
    notify()
  })
}

export async function promptInstall() {
  const prompt = deferredPrompt || window.deferredInstallPrompt
  if (!prompt) return { outcome: 'unavailable' }
  await prompt.prompt()
  const choice = await prompt.userChoice
  if (choice.outcome === 'accepted') {
    deferredPrompt = null
    window.deferredInstallPrompt = null
    notify()
  }
  return choice
}
