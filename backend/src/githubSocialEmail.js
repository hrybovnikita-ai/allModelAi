const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEntryEmail(entry) {
    return typeof entry?.email === 'string' ? entry.email.trim().toLowerCase() : '';
}

function pickGitHubSignInEmail(entries) {
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

async function githubGet(accessToken, path) {
    const response = await fetch(`https://api.github.com${path}`, {
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${accessToken}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'AllModelAI-Social-Auth',
        },
    });
    if (!response.ok) {
        const err = Object.assign(new Error('GitHub credentials are invalid or expired. Sign in again.'), { status: 401, code: 'INVALID_GITHUB_TOKEN' });
        throw err;
    }
    return response.json();
}

async function fetchGitHubIdentity(accessToken) {
    const token = String(accessToken || '').trim();
    if (!token || token.length > 512) {
        throw Object.assign(new Error('GitHub access token is required.'), { status: 400, code: 'INVALID_REQUEST' });
    }
    const [user, emails] = await Promise.all([
        githubGet(token, '/user'),
        githubGet(token, '/user/emails'),
    ]);
    return { user, emails };
}

/**
 * Build a social profile from a GitHub OAuth access token (user:email scope).
 * @param {string} accessToken
 * @param {string|null} expectedSubject Firebase github.com identity subject to match
 */
async function profileFromGitHubAccessToken(accessToken, expectedSubject = null) {
    const { user, emails } = await fetchGitHubIdentity(accessToken);
    const subject = user?.id != null ? String(user.id) : '';
    if (!subject || subject.length > 512) {
        throw Object.assign(new Error('GitHub account could not be verified.'), { status: 401, code: 'INVALID_IDENTITY' });
    }
    if (expectedSubject != null && String(expectedSubject) !== subject) {
        throw Object.assign(new Error('GitHub account does not match the signed-in identity.'), { status: 401, code: 'INVALID_IDENTITY' });
    }
    const email = pickGitHubSignInEmail(emails);
    if (!email) {
        throw Object.assign(new Error('A verified email is required. Verify an email in GitHub Settings, then retry.'), { status: 403, code: 'VERIFIED_EMAIL_REQUIRED' });
    }
    let avatar = null;
    try {
        const url = new URL(user.avatar_url);
        if (url.protocol === 'https:' && url.href.length <= 2048) avatar = url.href;
    } catch { /* optional */ }
    return {
        provider: 'github.com',
        subject,
        email,
        name: String(user.name || user.login || email.split('@')[0]).slice(0, 100),
        avatar,
    };
}

module.exports = {
    pickGitHubSignInEmail,
    fetchGitHubIdentity,
    profileFromGitHubAccessToken,
};
