/**
 * Secure lazy Zilliz Cloud client for AI Memory vectors.
 * Does not connect until getZillizClient() is called and config is complete.
 * Never logs tokens, passwords, or full URIs with credentials.
 */

const { getZillizConfig, getZillizConfigReport } = require('./zillizConfig');

let clientPromise = null;

function loadSdk() {
    try {
        // Optional until installed; keep app bootable without the package.
        // eslint-disable-next-line import/no-extraneous-dependencies, global-require
        return require('@zilliz/milvus2-sdk-node');
    } catch (error) {
        const err = new Error(
            'Zilliz SDK is not installed. Run: npm install @zilliz/milvus2-sdk-node --prefix backend',
        );
        err.code = 'ZILLIZ_SDK_MISSING';
        err.cause = error;
        throw err;
    }
}

function assertConfigured(cfg) {
    if (!cfg.address) {
        const err = new Error('ZILLIZ_URI is missing. Paste the cluster Public Endpoint from Zilliz Cloud.');
        err.code = 'ZILLIZ_URI_MISSING';
        throw err;
    }
    if (!cfg.token) {
        const err = new Error(
            'Zilliz auth is incomplete. Set ZILLIZ_TOKEN (API key) or both ZILLIZ_API_USER and ZILLIZ_API_PASSWORD.',
        );
        err.code = 'ZILLIZ_AUTH_MISSING';
        throw err;
    }
}

/**
 * @returns {Promise<import('@zilliz/milvus2-sdk-node').MilvusClient>}
 */
async function getZillizClient() {
    const cfg = getZillizConfig();
    if (!cfg.enabled) {
        const err = new Error('Zilliz is disabled or not configured (set ZILLIZ_URI + auth, or ZILLIZ_ENABLED=true).');
        err.code = 'ZILLIZ_DISABLED';
        throw err;
    }
    assertConfigured(cfg);

    if (!clientPromise) {
        clientPromise = (async () => {
            const { MilvusClient } = loadSdk();
            const client = new MilvusClient({
                address: cfg.address,
                token: cfg.token,
                ssl: /^https:\/\//i.test(cfg.address) || undefined,
                database: cfg.database,
            });
            return client;
        })().catch((error) => {
            clientPromise = null;
            throw error;
        });
    }
    return clientPromise;
}

async function pingZilliz() {
    const report = getZillizConfigReport();
    if (!report.configured) {
        return { ok: false, code: 'ZILLIZ_NOT_CONFIGURED', report };
    }
    try {
        const client = await getZillizClient();
        const cfg = getZillizConfig();
        let hasCollection = null;
        if (typeof client.hasCollection === 'function') {
            const result = await Promise.race([
                client.hasCollection({ collection_name: cfg.collection }),
                new Promise((_, reject) => {
                    setTimeout(() => {
                        const err = new Error('Zilliz ping timed out after 12s');
                        err.code = 'ZILLIZ_TIMEOUT';
                        reject(err);
                    }, 12_000);
                }),
            ]);
            hasCollection = Boolean(result?.value ?? result);
        }
        return {
            ok: true,
            code: 'ZILLIZ_OK',
            collection: cfg.collection,
            hasCollection,
            report,
        };
    } catch (error) {
        const details = String(error.details || error.message || 'Zilliz ping failed').slice(0, 200);
        return {
            ok: false,
            code: error.code === 14
                ? 'ZILLIZ_UNAVAILABLE'
                : (error.code || 'ZILLIZ_PING_FAILED'),
            message: details,
            report,
        };
    }
}

function resetZillizClientForTests() {
    clientPromise = null;
}

module.exports = {
    getZillizClient,
    pingZilliz,
    resetZillizClientForTests,
    getZillizConfigReport,
};
