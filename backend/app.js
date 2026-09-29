const path = require('node:path');

if (process.env.NODE_ENV !== 'test') {
    try {
        process.loadEnvFile(path.join(__dirname, '.env'));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

// Vercel must proxy /api to PERSISTENT_BACKEND_ORIGIN (Render/Fly/Docker disk).
// Never run SQLite session storage on ephemeral Vercel instances.
const onVercel = Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_URL);
module.exports = onVercel
    ? require('./src/vercelProxy').createVercelProxy()
    : require('./localApp');
