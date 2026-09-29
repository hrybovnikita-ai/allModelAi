const app = require('./app');
const {
    logRuntimeDiagnostics,
    verifyDatabaseConnection,
} = require('./src/runtimeDiagnostics');

const PORT = process.env.PORT || 5050;
const HOST = process.env.HOST || '0.0.0.0';
const database = app.locals.db;
const databaseConnected = verifyDatabaseConnection(database?.database);

if (!databaseConnected) {
    console.error('[RUNTIME] database connected: false');
    console.error('[RUNTIME] Refusing to start: active database connection check failed.');
    process.exit(1);
}

const server = app.listen(PORT, HOST, () => {
    logRuntimeDiagnostics({
        databasePath: database?.filePath,
        database: database?.database,
        databaseEngine: database?.engine || 'sqlite',
        databaseConnected,
    });
    try {
        const providerHealth = require('./src/providerHealth');
        providerHealth.logStartupConfig();
        if (process.env.DISABLE_PROVIDER_PROBE_WARMUP !== 'true') {
            setImmediate(() => providerHealth.warmProviderProbes());
        }
    } catch (error) {
        console.warn('[CONFIG] Provider diagnostics unavailable:', error.message);
    }
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log(`Phones and tablets can use this same process over the public URL or LAN IP.`);
    if (database.engine === 'postgres') {
        console.log('Database is connected (PostgreSQL via DATABASE_URL).');
    } else {
        console.log(`Database is connected at ${database.filePath}`);
    }
    const stripeReady = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
    const stripePk = Boolean(
        process.env.STRIPE_PUBLISHABLE_KEY?.trim()
        || process.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim(),
    );
    const { wayforpayCheckoutAvailable, wayforpayConfig } = require('./src/wayforpay/config');
    if (wayforpayCheckoutAvailable()) {
        const cfg = wayforpayConfig();
        console.log(`WayForPay checkout: ${cfg.testMode ? 'TEST MODE (mock, no real charges)' : 'LIVE'}.`);
    }
    if (stripeReady && stripePk) {
        const mode = process.env.STRIPE_SECRET_KEY.trim().startsWith('sk_live_') ? 'live' : 'test';
        console.log(`Stripe payments: enabled (${mode} mode).`);
    } else if (stripeReady) {
        console.log('Stripe payments: secret key set; add STRIPE_PUBLISHABLE_KEY for embedded checkout.');
    } else if (!wayforpayCheckoutAvailable()) {
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
