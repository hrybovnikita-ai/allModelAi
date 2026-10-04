const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEntryEmail(entry) {
  return typeof entry?.email === 'string' ? entry.email.trim().toLowerCase() : '';
}

/** Prefer verified primary, then any verified email (including GitHub noreply addresses). */
export function pickGitHubSignInEmail(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const primaryVerified = entries.find((entry) => entry?.primary && entry?.verified);
  if (primaryVerified) {
    const email = normalizeEntryEmail(primaryVerified);
    if (email.length <= 254 && EMAIL_RE.test(email)) return email;
  }

  for (const entry of entries) {
    if (!entry?.verified) continue;
    const email = normalizeEntryEmail(entry);
    if (email.length <= 254 && EMAIL_RE.test(email)) return email;
  }

  return null;
}

export async function fetchGitHubEmails(accessToken) {
  const token = String(accessToken || '').trim();
  if (!token) {
    throw Object.assign(new Error('GitHub access token is missing.'), { code: 'auth/missing-email' });
  }

  const response = await fetch('https://api.github.com/user/emails', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw Object.assign(
      new Error('Could not load email addresses from GitHub. Try signing in again.'),
      { code: response.status === 401 ? 'auth/invalid-credential' : 'auth/network-request-failed' },
    );
  }

  return response.json();
}

export async function resolveGitHubSignInEmail(accessToken) {
  const emails = await fetchGitHubEmails(accessToken);
  const email = pickGitHubSignInEmail(emails);
  if (!email) {
    throw Object.assign(
      new Error('GitHub did not provide a verified email. Add and verify an email in GitHub Settings, then retry.'),
      { code: 'auth/missing-email' },
    );
  }
  return email;
}
