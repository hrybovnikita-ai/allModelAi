const {
    buildPublicHealthSummary,
    buildAdminHealthReport,
    filterProviders,
    sortProviders,
    parseWindow,
    sanitizeProviderRow,
    sanitizeModelRow,
} = require('../services/healthMonitorService');
const { probesEnabled } = require('../services/providerHealthMonitor');

const getHealthSummary = async (req, res) => {
    const { key: window } = parseWindow(req.query.window);
    const payload = await buildPublicHealthSummary(req.app.locals.db, { window });
    return res.json(payload);
};

const getHealthProviders = async (req, res) => {
    const { key: window } = parseWindow(req.query.window);
    const admin = await buildAdminHealthReport(req.app.locals.db, { probe: false, window });
    let providers = admin.providers;
    if (req.query.status || req.query.q || req.query.sort) {
        providers = filterProviders(providers, {
            statusFilter: req.query.status,
            search: req.query.q,
        });
        providers = sortProviders(providers, req.query.sort);
    }
    const payload = {
        updatedAt: admin.updatedAt,
        window: admin.window,
        summary: admin.summary,
        providers: providers.map((p) => ({
            ...sanitizeProviderRow(p),
            modelCount: p.modelCount,
        })),
    };
    if (req.query.includeModels === '1') {
        payload.models = admin.models.map((m) => sanitizeModelRow(m));
    }
    if (req.query.includeCharts === '1') {
        payload.charts = admin.charts;
    }
    if (admin.notes) payload.notes = admin.notes;
    return res.json(payload);
};

const getHealthProviderById = async (req, res) => {
    const id = String(req.params.providerId || '').toLowerCase();
    const payload = await buildPublicHealthSummary(req.app.locals.db, { window: req.query.window });
    const provider = payload.providers.find((p) => p.id === id);
    if (!provider) return res.status(404).json({ message: 'Provider not found.' });
    const models = payload.models.filter((m) => m.providerId === id);
    return res.json({ provider, models });
};

const getHealthModels = async (req, res) => {
    const payload = await buildPublicHealthSummary(req.app.locals.db, { window: req.query.window });
    return res.json({ updatedAt: payload.updatedAt, models: payload.models });
};

const getHealthModelById = async (req, res) => {
    const id = String(req.params.modelId || '').toLowerCase();
    const payload = await buildPublicHealthSummary(req.app.locals.db, { window: req.query.window });
    const model = payload.models.find((m) => m.id === id);
    if (!model) return res.status(404).json({ message: 'Model not found.' });
    return res.json({ model });
};

const getAdminHealthProviders = async (req, res) => {
    const probe = req.query.probe === '1';
    if (probe && !probesEnabled()) {
        return res.status(400).json({
            code: 'PROBES_DISABLED',
            message: 'Set ENABLE_PROVIDER_HEALTH_PROBES=1 to run active health checks.',
        });
    }
    const { key: window } = parseWindow(req.query.window);
    const report = await buildAdminHealthReport(req.app.locals.db, { probe, window });
    return res.json(report);
};

const postAdminHealthCheck = async (req, res) => {
    if (!probesEnabled()) {
        return res.status(400).json({
            code: 'PROBES_DISABLED',
            message: 'Active health checks are disabled. Set ENABLE_PROVIDER_HEALTH_PROBES=1 on the server.',
        });
    }
    const report = await buildAdminHealthReport(req.app.locals.db, { probe: true, window: req.body?.window || '1h' });
    return res.json({
        updatedAt: report.updatedAt,
        probeExecuted: report.probeExecuted,
        providers: report.providers,
    });
};

module.exports = {
    getHealthSummary,
    getHealthProviders,
    getHealthProviderById,
    getHealthModels,
    getHealthModelById,
    getAdminHealthProviders,
    postAdminHealthCheck,
};
