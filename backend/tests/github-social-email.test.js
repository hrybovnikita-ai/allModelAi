const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pickGitHubSignInEmail } = require('../src/githubSocialEmail');

test('pickGitHubSignInEmail accepts verified GitHub noreply addresses', () => {
    const email = pickGitHubSignInEmail([
        { email: '654321+noreply@users.noreply.github.com', verified: true, primary: true },
    ]);
    assert.equal(email, '654321+noreply@users.noreply.github.com');
});

const { profileFromGitHubAccessToken } = require('../src/githubSocialEmail');

test('private verified email resolves even when public GitHub email is null', async (t) => {
    const previous = global.fetch;
    t.after(() => { global.fetch = previous; });
    const paths = [];
    global.fetch = async (url, options) => {
        paths.push(url);
        assert.equal(options.headers.Authorization, 'Bearer test-token');
        return Response.json(url.endsWith('/emails')
            ? [{ email: 'Private@Example.com', primary: true, verified: true, visibility: null }]
            : { id: 123, login: 'private-user', email: null });
    };
    const profile = await profileFromGitHubAccessToken('test-token', '123');
    assert.equal(profile.email, 'private@example.com');
    assert.equal(profile.subject, '123');
    assert.ok(paths.includes('https://api.github.com/user/emails'));
    await assert.rejects(profileFromGitHubAccessToken('test-token', '456'), { code: 'INVALID_IDENTITY' });
});

test('unverified GitHub email cannot authenticate', async (t) => {
    const previous = global.fetch;
    t.after(() => { global.fetch = previous; });
    global.fetch = async (url) => Response.json(url.endsWith('/emails')
        ? [{ email: 'private@example.com', primary: true, verified: false }]
        : { id: 123, login: 'private-user' });
    await assert.rejects(profileFromGitHubAccessToken('test-token', '123'), { code: 'VERIFIED_EMAIL_REQUIRED' });
});
