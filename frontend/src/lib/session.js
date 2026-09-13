let verifiedSession = null;
let pendingSession = null;
const cacheDuration = 5 * 60 * 1000;

/**
 * Returns an object representing the storage to use for the session.
 * Prefers localStorage, but falls back to sessionStorage if localStorage is unavailable.
 * All operations sync both storages to keep legacy code working.
 */
function getStorage() {
  const local =
    typeof globalThis !== 'undefined' &&
    typeof globalThis.localStorage !== 'undefined'
      ? globalThis.localStorage
      : null;

  const session =
    typeof globalThis !== 'undefined' &&
    typeof globalThis.sessionStorage !== 'undefined'
      ? globalThis.sessionStorage
      : null;

  const primary = local || session;
  const fallback = primary === local ? session : local;

  function read(storage, key) {
    if (!storage) return null;

    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function write(storage, key, value) {
    if (!storage) return;

    try {
      storage.setItem(key, value);
    } catch {
      return;
    }
  }

  function remove(storage, key) {
    if (!storage) return;

    try {
      storage.removeItem(key);
    } catch {
      return;
    }
  }

  return {
    getItem(key) {
      const val = read(primary, key);

      if (val !== null) {
        return val;
      }

      return read(fallback, key);
    },

    setItem(key, value) {
      write(primary, key, value);
      write(fallback, key, value);
    },

    removeItem(key) {
      remove(primary, key);
      remove(fallback, key);
    },
  };
}

export function rememberSession(user) {
  if (!user?.email) throw new Error('Missing session user');
  const saved = JSON.stringify(user);
  const storage = getStorage();
  storage.setItem('allmodelai_user', saved);
  verifiedSession = { user, saved, expiresAt: Date.now() + cacheDuration };
  return user;
}

export async function restoreSession() {
  const storage = getStorage();
  const saved = storage.getItem('allmodelai_user');
  if (verifiedSession?.saved === saved && verifiedSession.expiresAt > Date.now()) {
    return verifiedSession.user;
  }
  if (pendingSession) return pendingSession;
  const initialSession = verifiedSession;
  pendingSession = (async () => {
    const response = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
    if (verifiedSession !== initialSession || storage.getItem('allmodelai_user') !== saved) {
      return verifiedSession?.saved === storage.getItem('allmodelai_user') ? verifiedSession.user : null;
    }
    if (response.status === 401) {
      verifiedSession = null;
      storage.removeItem('allmodelai_user');
      return null;
    }
    if (!response.ok) throw new Error('Could not verify your session. Please try again.');
    const data = await response.json();
    return rememberSession(data.user);
  })();
  try {
    return await pendingSession;
  } finally {
    pendingSession = null;
  }
}

/**
 * Clears session data from both localStorage and sessionStorage.
 */
export function clearAllSessionData() {
  const storage = getStorage();
  storage.removeItem('allmodelai_user');
}
