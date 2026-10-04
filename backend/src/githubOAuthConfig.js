function readGithubOAuthEnv() {
    return {
        clientId: String(process.env.GITHUB_CLIENT_ID || '').trim(),
        clientSecret: String(process.env.GITHUB_CLIENT_SECRET || '').trim(),
    };
}

function isGithubOAuthConfigured() {
    const { clientId, clientSecret } = readGithubOAuthEnv();
    return Boolean(clientId && clientSecret);
}

module.exports = {
    readGithubOAuthEnv,
    isGithubOAuthConfigured,
};
