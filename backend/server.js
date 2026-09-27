const app = require('./app');

const PORT = process.env.PORT || 5050;
const HOST = process.env.HOST || '0.0.0.0';
const database = app.locals.db;

const server = app.listen(PORT, HOST, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log(`Phones and tablets can use this same process over the public URL or LAN IP.`);
    console.log(`Database is connected at ${database.filePath}`);
    const stripeReady = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
    const stripePk = Boolean(
        process.env.STRIPE_PUBLISHABLE_KEY?.trim()
        || process.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim(),
    );
    if (stripeReady && stripePk) {
        const mode = process.env.STRIPE_SECRET_KEY.trim().startsWith('sk_live_') ? 'live' : 'test';
        console.log(`Stripe payments: enabled (${mode} mode).`);
    } else if (stripeReady) {
        console.log('Stripe payments: secret key set; add STRIPE_PUBLISHABLE_KEY for embedded checkout.');
    } else {
        console.log('Stripe payments: not configured (add STRIPE_SECRET_KEY to backend/.env).');
    }
});

const closeServer = () => {
    server.close(async () => {
        await app.locals.cache.close();
        database.close();
        process.exit(0);
    });
};

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
