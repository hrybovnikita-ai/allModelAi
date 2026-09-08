const path = require('node:path');

try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

const command = process.argv[2];
if (!['init', 'check'].includes(command)) {
    throw new Error('Usage: node scripts/database.js init|check');
}

const { connectDatabase } = require('../src/db');
const connection = connectDatabase();
try {
    const db = connection.database;
    if (command === 'check') {
        const result = db.pragma('integrity_check');
        if (result.some((row) => row.integrity_check !== 'ok') || db.pragma('foreign_key_check').length) {
            throw new Error('Database integrity check failed');
        }
    }
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    console.log(JSON.stringify({ engine: 'sqlite', file: connection.filePath, status: 'ok', tables: tables.map((row) => row.name) }, null, 2));
} finally {
    connection.close();
}
