const { isPostgresDatabaseMode, getTableColumnNames } = require('../db/schemaIntrospection');

const ensureWayforpaySchema = (database) => {
    if (isPostgresDatabaseMode()) {
        return;
    }
    database.exec(`
        CREATE TABLE IF NOT EXISTS wayforpay_payments (
            order_reference TEXT PRIMARY KEY,
            user_email TEXT NOT NULL,
            user_id INTEGER,
            plan_key TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT NOT NULL,
            status TEXT NOT NULL,
            transaction_status TEXT,
            reason_code TEXT,
            merchant_account TEXT,
            payment_provider TEXT DEFAULT 'wayforpay',
            is_test INTEGER NOT NULL DEFAULT 0,
            expires_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            paid_at TEXT,
            callback_received_at TEXT
        );
        CREATE INDEX IF NOT EXISTS wayforpay_payments_user_email
        ON wayforpay_payments(user_email, created_at DESC);
    `);
    const columns = getTableColumnNames(database, 'wayforpay_payments');
    const addColumn = (name, ddl) => {
        if (!columns.includes(name)) database.exec(`ALTER TABLE wayforpay_payments ADD COLUMN ${ddl}`);
    };
    addColumn('payment_provider', "payment_provider TEXT DEFAULT 'wayforpay'");
    addColumn('is_test', 'is_test INTEGER NOT NULL DEFAULT 0');
    addColumn('expires_at', 'expires_at TEXT');
};

const insertPayment = (database, row) => {
    database.prepare(`
        INSERT INTO wayforpay_payments (
            order_reference, user_email, user_id, plan_key, amount, currency, status,
            merchant_account, payment_provider, is_test, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        row.orderReference,
        row.userEmail,
        row.userId,
        row.planKey,
        row.amount,
        row.currency,
        row.status,
        row.merchantAccount,
        row.paymentProvider || 'wayforpay',
        row.isTest ? 1 : 0,
        row.expiresAt || null,
        row.createdAt,
        row.updatedAt,
    );
};

const getPaymentByReference = (database, orderReference) => database.prepare(`
    SELECT
        order_reference AS orderReference,
        user_email AS userEmail,
        user_id AS userId,
        plan_key AS planKey,
        amount,
        currency,
        status,
        transaction_status AS transactionStatus,
        reason_code AS reasonCode,
        merchant_account AS merchantAccount,
        payment_provider AS paymentProvider,
        is_test AS isTest,
        expires_at AS expiresAt,
        created_at AS createdAt,
        updated_at AS updatedAt,
        paid_at AS paidAt,
        callback_received_at AS callbackReceivedAt
    FROM wayforpay_payments
    WHERE order_reference = ?
`).get(orderReference);

const updatePaymentStatus = (database, orderReference, patch) => {
    const now = new Date().toISOString();
    database.prepare(`
        UPDATE wayforpay_payments SET
            status = COALESCE(?, status),
            transaction_status = COALESCE(?, transaction_status),
            reason_code = COALESCE(?, reason_code),
            paid_at = COALESCE(?, paid_at),
            callback_received_at = COALESCE(?, callback_received_at),
            expires_at = COALESCE(?, expires_at),
            updated_at = ?
        WHERE order_reference = ?
    `).run(
        patch.status ?? null,
        patch.transactionStatus ?? null,
        patch.reasonCode ?? null,
        patch.paidAt ?? null,
        patch.callbackReceivedAt ?? null,
        patch.expiresAt ?? null,
        now,
        orderReference,
    );
};

module.exports = {
    ensureWayforpaySchema,
    insertPayment,
    getPaymentByReference,
    updatePaymentStatus,
};
