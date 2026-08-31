const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const routes = require('./src/routes/routes');
const { stripeWebhook } = require('./src/controllers/controllers');
const { connectDatabase } = require('./src/db');
const users = require('./src/data/data');
const path = require('path');

if (process.env.NODE_ENV !== 'test') {
    try {
        process.loadEnvFile(path.join(__dirname, '.env'));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

const app = express();
app.locals.db = connectDatabase();
const storedData = app.locals.db.read();
if (storedData.users.length) {
    const seedPasswords = new Map(users.map((user) => [user.email.toLowerCase(), user.passwordHash]));
    let passwordsAdded = false;
    const mergedUsers = storedData.users.map((user) => {
        if (user.passwordHash) return user;
        const passwordHash = seedPasswords.get(user.email.toLowerCase());
        if (!passwordHash) return user;
        passwordsAdded = true;
        return { ...user, passwordHash };
    });
    users.splice(0, users.length, ...mergedUsers);
    if (passwordsAdded) {
        storedData.users = users;
        app.locals.db.write(storedData);
    }
} else {
    storedData.users = users;
    app.locals.db.write(storedData);
}

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173', credentials: true }));
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(express.json());
app.use(cookieParser());
const requestCounts = new Map();
app.use('/api', (req, res, next) => {
    if (process.env.NODE_ENV !== 'production') return next();
    const bucket = req.path === '/chat' ? 'chat' : 'api';
    const key = `${req.ip || 'unknown'}:${bucket}`;
    const now = Date.now();
    const windowStart = now - 60 * 1000;
    const timestamps = (requestCounts.get(key) || []).filter((time) => time > windowStart);
    const limit = req.path === '/chat' ? 60 : 300;
    if (timestamps.length >= limit) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ message: 'This account is sending requests too quickly. Wait a moment, then retry your message.' });
    }
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
