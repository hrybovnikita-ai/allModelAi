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

let server;

async function bootstrapPostgresSchema() {
    if (database.engine !== 'postgres') return;
    const {
        ensurePostgresAiImprovementAsync,
        ensurePostgresVideoJobsAsync,
    } = require('./src/db/postgresSchemaBootstrap');
    try {
        const result = await ensurePostgresAiImprovementAsync(database);
        console.log('[PG_BOOTSTRAP] ai_improvement tables', result.applied ? 'ready' : result.reason || 'skipped');
    } catch (error) {
        console.error('[PG_BOOTSTRAP] ai_improvement failed:', error.code || error.name, error.message);
        console.error('[PG_BOOTSTRAP] Run: npm run db:migrate');
    }
    try {
        const video = await ensurePostgresVideoJobsAsync(database);
        console.log('[PG_BOOTSTRAP] video_generation_jobs', video.applied ? 'ready' : video.reason || 'skipped');
    } catch (error) {
        console.error('[PG_BOOTSTRAP] video jobs failed:', error.code || error.name, error.message);
    }
}

async function startServer() {
    await bootstrapPostgresSchema();

    server = app.listen(PORT, HOST, () => {
        logRuntimeDiagnostics({
            databasePath: database?.filePath,
            database: database?.database,
            databaseEngine: database?.engine || 'sqlite',
            databaseConnected,
        });
        try {
            const providerHealth = require('./src/providerHealth');
            providerHealth.logStartupConfig();
            const { warmFirebaseAdmin, isFirebaseAdminConfigured } = require('./src/firebaseAdmin');
            if (isFirebaseAdminConfigured()) {
                const ready = warmFirebaseAdmin();
                console.log(`[CONFIG] firebase admin sdk: ${ready ? 'ready' : 'initialization failed (see [AUTH] logs)'}`);
            }
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
}

const closeServer = () => {
    if (!server) {
        process.exit(0);
        return;
    }
    server.close(async () => {
        await app.locals.cache.close();
        database.close();
        process.exit(0);
    });
};

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);

startServer().catch((error) => {
    console.error('[RUNTIME] Server failed to start:', error.message);
    process.exit(1);
});
