import { isCapacitorNative } from './apiBase.js';

export async function unregisterAllServiceWorkers() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if (typeof caches !== 'undefined') {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

export function shouldRegisterWebServiceWorker() {
  if (import.meta.env.VITE_DISABLE_PWA === 'true') return false;
  if (!import.meta.env.PROD) return false;
  if (isCapacitorNative()) return false;
  return true;
}

export async function initServiceWorker() {
  if (isCapacitorNative()) {
    await unregisterAllServiceWorkers();
    return;
  }

  if (!shouldRegisterWebServiceWorker()) return;

  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true });
}
