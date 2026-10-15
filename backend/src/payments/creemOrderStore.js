const { isPostgresConnection } = require('../db/postgresHttpReads');

const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS creem_credit_orders (
    order_id TEXT PRIMARY KEY,
    checkout_id TEXT,
    email TEXT NOT NULL,
    package_id TEXT NOT NULL,
    amount_cents INTEGER,
    currency TEXT,
    status TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'creem',
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS creem_credit_orders_email_created
ON creem_credit_orders(email, created_at DESC);
`;

const POSTGRES_DDL = `
CREATE TABLE IF NOT EXISTS creem_credit_orders (
    order_id TEXT PRIMARY KEY,
    checkout_id TEXT,
    email TEXT NOT NULL,
    package_id TEXT NOT NULL,
    amount_cents INTEGER,
    currency TEXT,
    status TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'creem',
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS creem_credit_orders_email_created
ON creem_credit_orders(email, created_at DESC);
`;

async function ensureCreemOrderSchema(connection) {
    if (!connection) return;
    if (isPostgresConnection(connection)) {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const pool = resolvePostgresAsyncPool(connection);
        return queryPgPool(pool, POSTGRES_DDL);
    }
    connection.database.exec(SQLITE_DDL);
}

async function upsertCreemOrder(connection, order) {
    await ensureCreemOrderSchema(connection);
    const now = new Date().toISOString();
    const payload = {
        orderId: String(order.orderId || '').trim(),
        checkoutId: order.checkoutId ? String(order.checkoutId) : null,
        email: String(order.email || '').trim().toLowerCase(),
        packageId: String(order.packageId || '').trim().toLowerCase(),
        amountCents: order.amountCents == null ? null : Number(order.amountCents),
        currency: order.currency ? String(order.currency).toUpperCase() : null,
        status: String(order.status || 'pending'),
        metadata: order.metadata || {},
    };
    if (!payload.orderId || !payload.email || !payload.packageId) {
        throw new Error('Invalid Creem order record');
    }
    const metaJson = JSON.stringify(payload.metadata);
    if (isPostgresConnection(connection)) {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const pool = resolvePostgresAsyncPool(connection);
        await queryPgPool(
            pool,
            `INSERT INTO creem_credit_orders
                (order_id, checkout_id, email, package_id, amount_cents, currency, status, metadata, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $9)
             ON CONFLICT (order_id) DO UPDATE SET
                checkout_id = EXCLUDED.checkout_id,
                status = EXCLUDED.status,
                amount_cents = EXCLUDED.amount_cents,
                currency = EXCLUDED.currency,
                metadata = EXCLUDED.metadata,
                updated_at = EXCLUDED.updated_at`,
            [
                payload.orderId,
                payload.checkoutId,
                payload.email,
                payload.packageId,
                payload.amountCents,
                payload.currency,
                payload.status,
                metaJson,
                now,
            ],
        );
        return payload;
    }
    connection.database.prepare(
        `INSERT INTO creem_credit_orders
            (order_id, checkout_id, email, package_id, amount_cents, currency, status, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(order_id) DO UPDATE SET
            checkout_id = excluded.checkout_id,
            status = excluded.status,
            amount_cents = excluded.amount_cents,
            currency = excluded.currency,
            metadata = excluded.metadata,
            updated_at = excluded.updated_at`,
    ).run(
        payload.orderId,
        payload.checkoutId,
        payload.email,
        payload.packageId,
        payload.amountCents,
        payload.currency,
        payload.status,
        metaJson,
        now,
        now,
    );
    return payload;
}

module.exports = {
    ensureCreemOrderSchema,
    upsertCreemOrder,
};
