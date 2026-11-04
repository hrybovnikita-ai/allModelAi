const { buildGatewayStatusSnapshot, probeProviderHealth } = require('../services/aiProviderGateway');

const getAiGatewayStatus = async (req, res) => {
    const snapshot = buildGatewayStatusSnapshot();
    if (req.query.probe === '1') {
        const provider = String(req.query.provider || '').trim().toLowerCase();
        if (provider) {
            snapshot.activeProbe = await probeProviderHealth(provider);
        }
    }
    return res.json(snapshot);
};

module.exports = {
    getAiGatewayStatus,
};
