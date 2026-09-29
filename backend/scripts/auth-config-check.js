#!/usr/bin/env node
const {
    loadBackendEnv,
    describeDatabaseUrlConfiguration,
    printPostgresConfigurationHints,
} = require('./auth-cli');

loadBackendEnv();
const status = describeDatabaseUrlConfiguration();
console.log(JSON.stringify({
    databaseEngine: status.databaseEngine,
    databaseUrlConfigured: status.databaseUrlConfigured,
    configuredFrom: status.configuredFrom,
    misnamedEnvKeysIgnored: status.misnamedEnvKeysIgnored,
    databaseUrlPlaceholder: status.databaseUrlPlaceholder,
}, null, 2));

if (status.databaseEngine !== 'postgres') {
    printPostgresConfigurationHints();
    process.exitCode = 1;
}
