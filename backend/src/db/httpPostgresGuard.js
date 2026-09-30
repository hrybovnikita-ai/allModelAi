const { AsyncLocalStorage } = require('node:async_hooks');

const httpRequestStorage = new AsyncLocalStorage();

function runHttpPostgresContext(next) {
    return httpRequestStorage.run({ inHttp: true }, next);
}

function isPostgresHttpRequest() {
    return httpRequestStorage.getStore()?.inHttp === true;
}

function forbidSyncPostgresInHttp() {
    if (!isPostgresHttpRequest()) {
        return;
    }
    const error = new Error(
        'Synchronous PostgreSQL access is forbidden during HTTP requests. Use queryPgPool / postgresHttpRepository.',
    );
    error.code = 'SYNC_POSTGRES_FORBIDDEN_IN_HTTP';
    throw error;
}

function httpPostgresGuardMiddleware(req, res, next) {
    runHttpPostgresContext(() => next());
}

module.exports = {
    runHttpPostgresContext,
    isPostgresHttpRequest,
    forbidSyncPostgresInHttp,
    httpPostgresGuardMiddleware,
};
