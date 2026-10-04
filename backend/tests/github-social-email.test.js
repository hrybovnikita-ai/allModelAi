const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pickGitHubSignInEmail } = require('../src/githubSocialEmail');

test('pickGitHubSignInEmail accepts verified GitHub noreply addresses', () => {
    const email = pickGitHubSignInEmail([
        { email: '654321+noreply@users.noreply.github.com', verified: true, primary: true },
    ]);
    assert.equal(email, '654321+noreply@users.noreply.github.com');
});
