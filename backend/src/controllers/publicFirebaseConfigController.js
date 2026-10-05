const { getPublicFirebaseWebConfig } = require('../firebaseWebPublic');

function getPublicFirebaseConfig(_req, res) {
    const payload = getPublicFirebaseWebConfig();
    if (!payload.configured) {
        return res.status(404).json({
            configured: false,
            message: 'Firebase web client configuration is not available on the server.',
        });
    }
    return res.json({
        configured: true,
        ...payload.config,
    });
}

module.exports = {
    getPublicFirebaseConfig,
};
