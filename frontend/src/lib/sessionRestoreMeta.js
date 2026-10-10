/** Result of the latest restoreSession / bootstrap attempt (not persisted). */
let lastMeta = {
  verified: true,
  issue: null,
};

export function setSessionRestoreMeta(partial) {
  lastMeta = {
    verified: partial.verified !== false,
    issue: partial.issue || null,
  };
}

export function peekSessionRestoreMeta() {
  return lastMeta;
}

export function consumeSessionRestoreMeta() {
  const snapshot = lastMeta;
  lastMeta = { verified: true, issue: null };
  return snapshot;
}

export function resetSessionRestoreMetaForTests() {
  lastMeta = { verified: true, issue: null };
}
