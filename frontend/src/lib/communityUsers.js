/** Internal / automated names that should not appear in the public community grid. */
const INTERNAL_NAME_PATTERNS = [
  /^tester$/i,
  /^video\s*tester$/i,
  /^claude\s*repro$/i,
  /^route\s*check$/i,
  /^probe\s*check$/i,
  /^mh\s*(auth|video)$/i,
  /^test(er|ing|user)?\b/i,
  /^automation\b/i,
  /^e2e\b/i,
  /^ci\b/i,
];

export function isPublicCommunityDisplayName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return false;
  return !INTERNAL_NAME_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function filterPublicCommunityUsers(users) {
  if (!Array.isArray(users)) return [];
  return users.filter(
    (user) => user && user.id != null && isPublicCommunityDisplayName(user.name),
  );
}

export function parseCommunityUsersPayload(data) {
  let list = null;
  if (Array.isArray(data?.users)) {
    list = data.users.filter((user) => user && user.id != null && user.name);
  } else if (Array.isArray(data)) {
    list = data
      .filter((user) => user && user.id != null && user.name)
      .map(({ id, name }) => ({ id, name }));
  }
  if (!list) return null;
  return filterPublicCommunityUsers(list);
}
