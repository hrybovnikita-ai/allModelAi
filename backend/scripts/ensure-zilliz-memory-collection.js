/**
 * Create/verify the allmodelai_user_memory collection in Zilliz Cloud.
 * Does not print credentials or full URIs.
 */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

const { ensureMemoryCollection, isZillizMemoryConfigured } = require('../src/services/zilliz/zillizMemoryStore');
const { getSchemaReport } = require('../src/services/zilliz/zillizMemorySchema');
const { getZillizConfigReport, getZillizClient } = require('../src/services/zilliz/zillizClient');
const { hostHint } = require('../src/services/zilliz/zillizEndpoint');
const { getZillizConfig } = require('../src/services/zilliz/zillizConfig');

async function main() {
    const report = getZillizConfigReport();
    if (!isZillizMemoryConfigured()) {
        console.error(JSON.stringify({
            ok: false,
            code: 'ZILLIZ_NOT_CONFIGURED',
            report,
        }, null, 2));
        process.exit(2);
    }

    const schema = getSchemaReport();
    console.log(JSON.stringify({
        phase: 'schema',
        collection: schema.collection,
        embeddingModel: schema.embeddingModel,
        embeddingDim: schema.embeddingDim,
        chatInjectionEnabled: schema.chatInjectionEnabled,
        hostHint: hostHint(getZillizConfig().address),
        authMode: report.authMode,
    }, null, 2));

    const ensured = await ensureMemoryCollection();
    const client = await getZillizClient();
    const listed = await client.listCollections();
    const names = Array.isArray(listed?.collection_names)
        ? listed.collection_names
        : (Array.isArray(listed?.data)
            ? listed.data.map((row) => row.name || row.collection_name).filter(Boolean)
            : []);

    console.log(JSON.stringify({
        phase: 'ensure',
        ok: true,
        collection: ensured.collection,
        created: ensured.created,
        presentInCluster: names.includes(ensured.collection),
        collectionCount: names.length,
        collections: names,
        schema: ensured.schema,
    }, null, 2));
}

main().catch((error) => {
    console.error(JSON.stringify({
        ok: false,
        code: error.code || 'ZILLIZ_ENSURE_FAILED',
        message: String(error.message || error).slice(0, 220),
    }, null, 2));
    process.exit(3);
});
