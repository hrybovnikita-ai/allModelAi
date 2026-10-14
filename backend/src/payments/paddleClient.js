const { Paddle, Environment, LogLevel } = require('@paddle/paddle-node-sdk');
const { paddleEnvironmentName } = require('./paddleConfig');

let cachedClient = null;
let cachedKey = null;

function getPaddleClient() {
    const apiKey = String(process.env.PADDLE_API_KEY || '').trim();
    if (!apiKey) return null;
    if (cachedClient && cachedKey === apiKey) return cachedClient;
    const environment = paddleEnvironmentName() === 'live'
        ? Environment.production
        : Environment.sandbox;
    cachedClient = new Paddle(apiKey, {
        environment,
        logLevel: process.env.NODE_ENV === 'production' ? LogLevel.error : LogLevel.warn,
    });
    cachedKey = apiKey;
    return cachedClient;
}

function resetPaddleClientForTests() {
    cachedClient = null;
    cachedKey = null;
}

module.exports = {
    getPaddleClient,
    resetPaddleClientForTests,
};
