const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const routes = require('./src/routes/routes');
const { connectDatabase } = require('./src/db');
const users = require('./src/data/data');
const path = require('path');

try {
    process.loadEnvFile(path.join(__dirname, '.env'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

const app = express();
app.locals.db = connectDatabase();
const storedData = app.locals.db.read();
if (storedData.users.length) {
    users.splice(0, users.length, ...storedData.users);
} else {
    storedData.users = users;
    app.locals.db.write(storedData);
}

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());
const requestCounts = new Map();
app.use('/api', (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - 60 * 1000;
    const timestamps = (requestCounts.get(key) || []).filter((time) => time > windowStart);
    if (timestamps.length >= 90) return res.status(429).json({ message: 'Too many requests. Please try again in a minute.' });
    timestamps.push(now);
    requestCounts.set(key, timestamps);
    return next();
});

app.get('/', (req, res) => {
    res.status(200).json({
        message: 'AllModelAI API is running',
    });
});

app.use('/api', routes);

app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

module.exports = app;
