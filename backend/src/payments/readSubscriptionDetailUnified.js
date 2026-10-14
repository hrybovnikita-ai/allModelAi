const { readSubscriptionDetail } = require('../billing/subscriptionLifecycle');
const { isPostgresConnection } = require('../db/postgresHttpReads');

async function readSubscriptionDetailUnified(connection, email) {
    if (isPostgresConnection(connection)) {
        const { readSubscriptionDetailAsync } = require('../billing/creditStatusAsync');
        return readSubscriptionDetailAsync(connection, email);
    }
    return readSubscriptionDetail(connection, email);
}

module.exports = {
    readSubscriptionDetailUnified,
};
