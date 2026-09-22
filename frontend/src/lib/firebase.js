import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver } from 'firebase/auth';

// Public web configuration only. Admin credentials must never have a VITE_ prefix.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
let auth;
export function getSocialAuth() {
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Social sign-in is not configured. Ask the administrator to set ${missing.join(', ')} in frontend/.env.`);
  if (!auth) {
    const app = getApps().find(item => item.name === 'allmodelai-social') || initializeApp(config, 'allmodelai-social');
    // Firebase only proves identity; AllModelAI keeps the durable HttpOnly session.
    auth = initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  }
  return auth;
}
