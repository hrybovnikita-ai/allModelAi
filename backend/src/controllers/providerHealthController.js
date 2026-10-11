const { assertPlusTestDiagnosticsAccess } = require('../billing/plusTestMode');
const { buildProviderHealthReport, probesEnabled } = require('../services/providerHealthMonitor');

const getDeveloperProviderHealth = async (req, res) => {
    if (!assertPlusTestDiagnosticsAccess(req, res)) return undefined;
    const probe = req.query.probe === '1';
    if (probe && !probesEnabled()) {
        return res.status(400).json({
            message: 'Active provider probes are disabled. Set ENABLE_PROVIDER_HEALTH_PROBES=1 on the server to run list-model health checks.',
            code: 'PROBES_DISABLED',
        });
    }
    const report = await buildProviderHealthReport(req.app.locals.db, { probe });
    return res.json(report);
};

module.exports = {
    getDeveloperProviderHealth,
};
