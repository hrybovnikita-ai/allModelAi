const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');

async function insertPaymentAsync(connection, row) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `INSERT INTO wayforpay_payments (
            order_reference, user_email, user_id, plan_key, amount, currency, status,
            merchant_account, payment_provider, is_test, expires_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
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
        ],
    );
}

async function getPaymentByReferenceAsync(connection, orderReference) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT
            order_reference AS "orderReference",
            user_email AS "userEmail",
            user_id AS "userId",
            plan_key AS "planKey",
            amount,
            currency,
            status,
            transaction_status AS "transactionStatus",
            reason_code AS "reasonCode",
            merchant_account AS "merchantAccount",
            payment_provider AS "paymentProvider",
            is_test AS "isTest",
            expires_at AS "expiresAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            paid_at AS "paidAt",
            callback_received_at AS "callbackReceivedAt"
         FROM wayforpay_payments
         WHERE order_reference = $1`,
        [orderReference],
    );
    return result.rows[0] || null;
}

async function listPaymentsForUserAsync(connection, email, limit = 25) {
    const pool = resolvePostgresAsyncPool(connection);
    const capped = Math.min(Math.max(Number(limit) || 25, 1), 50);
    const result = await queryPgPool(
        pool,
        `SELECT
            order_reference AS "orderReference",
            plan_key AS "planKey",
            amount,
            currency,
            status,
            is_test AS "isTest",
            created_at AS "createdAt",
            paid_at AS "paidAt"
         FROM wayforpay_payments
         WHERE user_email = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [String(email).trim().toLowerCase(), capped],
    );
    return result.rows;
}

async function updatePaymentStatusAsync(connection, orderReference, patch) {
    const pool = resolvePostgresAsyncPool(connection);
    const fields = [];
    const values = [];
    let index = 1;
    const assign = (column, value) => {
        fields.push(`${column} = $${index}`);
        values.push(value);
        index += 1;
    };
    if (patch.status != null) assign('status', patch.status);
    if (patch.transactionStatus != null) assign('transaction_status', patch.transactionStatus);
    if (patch.reasonCode != null) assign('reason_code', patch.reasonCode);
    if (patch.paidAt != null) assign('paid_at', patch.paidAt);
    if (patch.callbackReceivedAt != null) assign('callback_received_at', patch.callbackReceivedAt);
    if (patch.expiresAt != null) assign('expires_at', patch.expiresAt);
    assign('updated_at', new Date().toISOString());
    values.push(orderReference);
    await queryPgPool(
        pool,
        `UPDATE wayforpay_payments SET ${fields.join(', ')} WHERE order_reference = $${index}`,
        values,
    );
}

module.exports = {
    insertPaymentAsync,
    getPaymentByReferenceAsync,
    listPaymentsForUserAsync,
    updatePaymentStatusAsync,
};
