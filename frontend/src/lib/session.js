let verifiedSession = null;
let pendingSession = null;
let sessionGeneration = 0;
const cacheDuration = 5 * 60 * 1000;

/**
 * Returns an object representing the storage to use for the session.
 * Prefers localStorage, but falls back to sessionStorage if localStorage is unavailable.
 * All operations sync both storages to keep legacy code working.
 */
function getStorage() {
  // Safari may throw while accessing the storage property itself.
  const access = (name) => {
    try { return globalThis[name] || null; } catch { return null; }
  };
  const local = access('localStorage');
  const session = access('sessionStorage');

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
  verifiedSession = { user, saved: storage.getItem('allmodelai_user'), expiresAt: Date.now() + cacheDuration };
  return user;
}

export async function restoreSession({ force = false } = {}) {
  const storage = getStorage();
  const saved = storage.getItem('allmodelai_user');
  if (!force && verifiedSession?.saved === saved && verifiedSession.expiresAt > Date.now()) {
    return verifiedSession.user;
  }
  if (pendingSession?.generation === sessionGeneration) return pendingSession.promise;
  const generation = sessionGeneration;
  const request = { generation };
  request.promise = (async () => {
    const response = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
    if (generation !== sessionGeneration) throw new Error('Session changed. Please try again.');
    if (response.status === 401) {
      verifiedSession = null;
      storage.removeItem('allmodelai_user');
      return null;
    }
    if (!response.ok) throw new Error('Could not verify your session. Please try again.');
    const data = await response.json();
    if (generation !== sessionGeneration) throw new Error('Session changed. Please try again.');
    return rememberSession(data.user);
  })();
  pendingSession = request;
  try {
    return await request.promise;
  } finally {
    if (pendingSession === request) pendingSession = null;
  }
}

// Verify that the browser accepted the HttpOnly cookie before opening the app.
export async function confirmSession(user) {
  clearAllSessionData();
  const verified = await restoreSession({ force: true });
  if (!verified || verified.email.toLowerCase() !== user?.email?.toLowerCase()) {
    clearAllSessionData();
    throw new Error('Your sign-in could not be verified. Please retry.');
  }
  return verified;
}

/**
 * Clears session data from both localStorage and sessionStorage.
 */
export function clearAllSessionData() {
  sessionGeneration++;
  verifiedSession = null;
  const storage = getStorage();
  storage.removeItem('allmodelai_user');
}
