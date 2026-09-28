import { resolveApiUrl } from './apiBase.js';

const entries = new Map();
const pending = new Map();
// An explicit allowlist prevents accidentally retaining private account data.
const allowed = new Set(['/api/status/models']);
export async function fetchPublicJson(url) {
  if (!allowed.has(url)) throw new Error('Only public model status can be cached');
  const resolvedUrl = resolveApiUrl(url);
  const entry = entries.get(resolvedUrl);
  if (entry && entry.expires > Date.now()) return structuredClone(entry.data);
  if (!pending.has(resolvedUrl)) {
    pending.set(resolvedUrl, fetch(resolvedUrl, { credentials: 'omit' }).then(async (response) => {
      if (!response.ok) throw new Error('Model availability is temporarily unavailable');
      const data = await response.json();
      entries.set(resolvedUrl, { data, expires: Date.now() + 10000 });
      return data;
    }).finally(() => pending.delete(resolvedUrl)));
  }
  return structuredClone(await pending.get(resolvedUrl));
}
