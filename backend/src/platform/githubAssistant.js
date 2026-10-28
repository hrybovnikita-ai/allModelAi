'use strict';

const crypto = require('crypto');

const connections = new Map();

function githubConfigured() {
    return Boolean(String(process.env.GITHUB_CLIENT_ID || '').trim() && String(process.env.GITHUB_CLIENT_SECRET || '').trim());
}

function connectionStatus(email) {
    const row = connections.get(String(email || '').toLowerCase());
    return {
        configured: githubConfigured(),
        connected: Boolean(row?.token),
        login: row?.login || '',
        scopes: ['repo:read'],
        canPush: false,
        requiredEnv: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_OAUTH_CALLBACK_URL'],
    };
}

function beginConnect(email) {
    if (!githubConfigured()) {
        const error = new Error('GitHub App credentials are not configured on the server.');
        error.status = 503;
        error.code = 'GITHUB_NOT_CONFIGURED';
        throw error;
    }
    const state = crypto.randomBytes(16).toString('hex');
    connections.set(String(email || '').toLowerCase(), { state, token: '', login: '' });
    const redirect = encodeURIComponent(String(process.env.GITHUB_OAUTH_CALLBACK_URL || '').trim());
    const clientId = encodeURIComponent(String(process.env.GITHUB_CLIENT_ID).trim());
    return {
        authorizeUrl: `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirect}&scope=repo&state=${state}`,
    };
}

function disconnect(email) {
    connections.delete(String(email || '').toLowerCase());
    return connectionStatus(email);
}

async function listRepositories(email) {
    const row = connections.get(String(email || '').toLowerCase());
    if (!row?.token) {
        const error = new Error('Connect GitHub before listing repositories.');
        error.status = 409;
        error.code = 'GITHUB_NOT_CONNECTED';
        throw error;
    }
    const response = await fetch('https://api.github.com/user/repos?per_page=20&sort=updated', {
        headers: {
            Authorization: `Bearer ${row.token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'AllModelAI',
        },
    });
    if (!response.ok) {
        const error = new Error('GitHub rejected the repository list request.');
        error.status = 502;
        throw error;
    }
    const data = await response.json();
    return (Array.isArray(data) ? data : []).map((repo) => ({
        name: repo.full_name,
        private: Boolean(repo.private),
        defaultBranch: repo.default_branch,
    }));
}

module.exports = {
    githubConfigured,
    connectionStatus,
    beginConnect,
    disconnect,
    listRepositories,
};
