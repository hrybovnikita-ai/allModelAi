import { resolveApiUrl } from './apiBase.js';
import {
  applyRuntimeFirebaseConfig,
  isFirebaseSocialConfigured,
} from './firebase.js';

export async function ensureFirebaseSocialConfigLoaded() {
  if (isFirebaseSocialConfigured()) {
    return true;
  }
  try {
    const response = await fetch(resolveApiUrl('/api/public/firebase-config'), {
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    if (data?.configured === false || !data?.apiKey) {
      return false;
    }
    applyRuntimeFirebaseConfig(data);
    return isFirebaseSocialConfigured();
  } catch {
    return false;
  }
}
