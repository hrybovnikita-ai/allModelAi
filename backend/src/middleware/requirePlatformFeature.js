const { getPlatformCapabilities, assertFeatureEnabled } = require('../platform/featureAccess');

function requirePlatformFeature(featureId) {
    return async (req, res, next) => {
        try {
            const connection = req.app.locals.db;
            const access = req.access || req.creditStatus || {};
            const capabilities = await getPlatformCapabilities(connection, req.user?.email, access);
            assertFeatureEnabled(capabilities, featureId);
            req.platformCapabilities = capabilities;
            next();
        } catch (error) {
            const status = error.status || 403;
            return res.status(status).json({
                code: error.code || 'FEATURE_UNAVAILABLE',
                featureId: error.featureId || featureId,
                message: error.message,
                reason: error.reason,
            });
        }
    };
}

module.exports = {
    requirePlatformFeature,
};
