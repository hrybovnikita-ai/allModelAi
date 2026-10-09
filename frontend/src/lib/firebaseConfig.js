/**
 * Canonical Firebase web client settings for AllModelAI.
 * Values come from Vite env (VITE_FIREBASE_*) with runtime fallback from GET /api/public/firebase-config.
 */
import {
  buildFirebaseClientConfig,
  getEffectiveFirebaseConfig,
  getFirebaseConfigEnvKeys,
  getMissingFirebaseConfigKeys,
  isFirebaseSocialConfigured,
} from './firebase.js';
import { DEFAULT_FIREBASE_AUTH_DOMAIN } from './firebaseAuthDomain.js';

export { DEFAULT_FIREBASE_AUTH_DOMAIN };

/** Resolved config passed to firebase.initializeApp (default authDomain: allmodelai.firebaseapp.com). */
export function getFirebaseConfig() {
  return getEffectiveFirebaseConfig();
}

export {
  buildFirebaseClientConfig,
  getEffectiveFirebaseConfig,
  getFirebaseConfigEnvKeys,
  getMissingFirebaseConfigKeys,
  isFirebaseSocialConfigured,
};
