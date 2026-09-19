const path = require('node:path');

if (process.env.NODE_ENV !== 'test') {
    try {
        process.loadEnvFile(path.join(__dirname, '.env'));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

// Vercel instances cannot own persistent SQLite users, sessions or conversations.
module.exports = process.env.VERCEL
    ? require('./src/vercelProxy').createVercelProxy()
    : require('./localApp');
