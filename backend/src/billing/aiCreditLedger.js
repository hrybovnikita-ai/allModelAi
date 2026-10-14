const { ensureAiCreditSchema } = require('./aiCreditSchema');
const { isPostgresConnection } = require('../db/postgresHttpReads');

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function parseMetadata(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function mapLedgerRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        email: row.email,
        entryType: row.entry_type ?? row.entryType,
        amount: Number(row.amount),
        balanceAfter: Number(row.balance_after ?? row.balanceAfter),
        referenceId: row.reference_id ?? row.referenceId,
        metadata: parseMetadata(row.metadata),
        createdAt: row.created_at ?? row.createdAt,
    };
}

async function ensureSchemaAsync(connection) {
    await ensureAiCreditSchema(connection);
}

function ensureSchemaSync(connection) {
    ensureAiCreditSchema(connection);
}

async function readBalanceAsync(connection, email) {
    await ensureSchemaAsync(connection);
    const normalized = normalizeEmail(email);
    if (isPostgresConnection(connection)) {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const pool = resolvePostgresAsyncPool(connection);
        const result = await queryPgPool(
            pool,
            'SELECT balance FROM ai_credit_balances WHERE email = $1',
            [normalized],
        );
        return Number(result.rows[0]?.balance ?? 0);
    }
    ensureSchemaSync(connection);
    const row = connection.database.prepare('SELECT balance FROM ai_credit_balances WHERE email = ?').get(normalized);
    return Number(row?.balance ?? 0);
}

function readBalanceSync(connection, email) {
    ensureSchemaSync(connection);
    const normalized = normalizeEmail(email);
    const row = connection.database.prepare('SELECT balance FROM ai_credit_balances WHERE email = ?').get(normalized);
    return Number(row?.balance ?? 0);
}

async function listLedgerAsync(connection, email, limit = 50) {
    await ensureSchemaAsync(connection);
    const normalized = normalizeEmail(email);
    const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);
    if (isPostgresConnection(connection)) {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const pool = resolvePostgresAsyncPool(connection);
        const result = await queryPgPool(
            pool,
            `SELECT id, email, entry_type, amount, balance_after, reference_id, metadata, created_at
             FROM ai_credit_ledger WHERE email = $1 ORDER BY created_at DESC LIMIT $2`,
            [normalized, cap],
        );
        return result.rows.map(mapLedgerRow);
    }
    ensureSchemaSync(connection);
    return connection.database.prepare(
        `SELECT id, email, entry_type AS entryType, amount, balance_after AS balanceAfter,
                reference_id AS referenceId, metadata, created_at AS createdAt
         FROM ai_credit_ledger WHERE email = ? ORDER BY created_at DESC LIMIT ?`,
    ).all(normalized, cap).map(mapLedgerRow);
}

/**
 * Idempotent credit grant (purchase, admin adjust). reference_id must be globally unique.
 */
async function grantCreditsIdempotentAsync(connection, {
    email,
    amount,
    referenceId,
    entryType = 'purchase',
    metadata = {},
}) {
    await ensureSchemaAsync(connection);
    const normalized = normalizeEmail(email);
    const credits = Number(amount);
    const ref = String(referenceId || '').trim();
    if (!normalized || !ref || !Number.isFinite(credits) || credits <= 0) {
        throw new Error('Invalid credit grant payload');
    }
    const now = new Date().toISOString();
    const metaJson = JSON.stringify(metadata);

    if (isPostgresConnection(connection)) {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const pool = resolvePostgresAsyncPool(connection);
        const existing = await queryPgPool(
            pool,
            'SELECT id, balance_after FROM ai_credit_ledger WHERE reference_id = $1',
            [ref],
        );
        if (existing.rows[0]) {
            const balance = await readBalanceAsync(connection, normalized);
            return { duplicate: true, balance, ledgerId: existing.rows[0].id };
        }
        await queryPgPool(pool, 'BEGIN');
        try {
            await queryPgPool(
                pool,
                `INSERT INTO ai_credit_balances (email, balance, updated_at) VALUES ($1, 0, $2)
                 ON CONFLICT (email) DO NOTHING`,
                [normalized, now],
            );
            const updated = await queryPgPool(
                pool,
                `UPDATE ai_credit_balances SET balance = balance + $1, updated_at = $2
                 WHERE email = $3 RETURNING balance`,
                [credits, now, normalized],
            );
            const balanceAfter = Number(updated.rows[0]?.balance ?? 0);
            const inserted = await queryPgPool(
                pool,
                `INSERT INTO ai_credit_ledger (email, entry_type, amount, balance_after, reference_id, metadata, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING id`,
                [normalized, entryType, credits, balanceAfter, ref, metaJson, now],
            );
            await queryPgPool(pool, 'COMMIT');
            return { duplicate: false, balance: balanceAfter, ledgerId: inserted.rows[0]?.id };
        } catch (error) {
            await queryPgPool(pool, 'ROLLBACK');
            if (/unique|duplicate/i.test(String(error.message))) {
                const balance = await readBalanceAsync(connection, normalized);
                return { duplicate: true, balance };
            }
            throw error;
        }
    }

    ensureSchemaSync(connection);
    const db = connection.database;
    const tx = db.transaction(() => {
        const prior = db.prepare('SELECT id, balance_after FROM ai_credit_ledger WHERE reference_id = ?').get(ref);
        if (prior) {
            return { duplicate: true, balance: readBalanceSync(connection, normalized), ledgerId: prior.id };
        }
        db.prepare(
            `INSERT INTO ai_credit_balances (email, balance, updated_at) VALUES (?, 0, ?)
             ON CONFLICT(email) DO NOTHING`,
        ).run(normalized, now);
        db.prepare(
            'UPDATE ai_credit_balances SET balance = balance + ?, updated_at = ? WHERE email = ?',
        ).run(credits, now, normalized);
        const balanceAfter = readBalanceSync(connection, normalized);
        const info = db.prepare(
            `INSERT INTO ai_credit_ledger (email, entry_type, amount, balance_after, reference_id, metadata, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(normalized, entryType, credits, balanceAfter, ref, metaJson, now);
        return { duplicate: false, balance: balanceAfter, ledgerId: info.lastInsertRowid };
    });
    return tx();
}

async function deductCreditsAsync(connection, {
    email,
    amount,
    referenceId,
    entryType = 'usage',
    metadata = {},
}) {
    await ensureSchemaAsync(connection);
    const normalized = normalizeEmail(email);
    const credits = Number(amount);
    const ref = String(referenceId || '').trim();
    if (!normalized || !ref || !Number.isFinite(credits) || credits <= 0) {
        throw new Error('Invalid credit deduction');
    }
    const now = new Date().toISOString();
    const metaJson = JSON.stringify(metadata);

    if (isPostgresConnection(connection)) {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const pool = resolvePostgresAsyncPool(connection);
        const existing = await queryPgPool(pool, 'SELECT id FROM ai_credit_ledger WHERE reference_id = $1', [ref]);
        if (existing.rows[0]) {
            return { duplicate: true, balance: await readBalanceAsync(connection, normalized) };
        }
        await queryPgPool(pool, 'BEGIN');
        try {
            const row = await queryPgPool(
                pool,
                'SELECT balance FROM ai_credit_balances WHERE email = $1 FOR UPDATE',
                [normalized],
            );
            const current = Number(row.rows[0]?.balance ?? 0);
            if (current < credits) {
                await queryPgPool(pool, 'ROLLBACK');
                const err = new Error('Insufficient AI credits');
                err.code = 'AI_CREDITS_EXHAUSTED';
                throw err;
            }
            const updated = await queryPgPool(
                pool,
                'UPDATE ai_credit_balances SET balance = balance - $1, updated_at = $2 WHERE email = $3 RETURNING balance',
                [credits, now, normalized],
            );
            const balanceAfter = Number(updated.rows[0]?.balance ?? 0);
            await queryPgPool(
                pool,
                `INSERT INTO ai_credit_ledger (email, entry_type, amount, balance_after, reference_id, metadata, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
                [normalized, entryType, -credits, balanceAfter, ref, metaJson, now],
            );
            await queryPgPool(pool, 'COMMIT');
            return { duplicate: false, balance: balanceAfter };
        } catch (error) {
            await queryPgPool(pool, 'ROLLBACK');
            throw error;
        }
    }

    ensureSchemaSync(connection);
    const db = connection.database;
    const tx = db.transaction(() => {
        if (db.prepare('SELECT id FROM ai_credit_ledger WHERE reference_id = ?').get(ref)) {
            return { duplicate: true, balance: readBalanceSync(connection, normalized) };
        }
        db.prepare(
            `INSERT INTO ai_credit_balances (email, balance, updated_at) VALUES (?, 0, ?)
             ON CONFLICT(email) DO NOTHING`,
        ).run(normalized, now);
        const current = readBalanceSync(connection, normalized);
        if (current < credits) {
            const err = new Error('Insufficient AI credits');
            err.code = 'AI_CREDITS_EXHAUSTED';
            throw err;
        }
        db.prepare(
            'UPDATE ai_credit_balances SET balance = balance - ?, updated_at = ? WHERE email = ?',
        ).run(credits, now, normalized);
        const balanceAfter = readBalanceSync(connection, normalized);
        db.prepare(
            `INSERT INTO ai_credit_ledger (email, entry_type, amount, balance_after, reference_id, metadata, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(normalized, entryType, -credits, balanceAfter, ref, metaJson, now);
        return { duplicate: false, balance: balanceAfter };
    });
    return tx();
}

/** Refund / chargeback — idempotent; deducts up to current balance if user already spent credits. */
async function reverseCreditsIdempotentAsync(connection, {
    email,
    amount,
    referenceId,
    entryType = 'refund',
    metadata = {},
}) {
    const credits = Number(amount);
    const ref = String(referenceId || '').trim();
    if (!Number.isFinite(credits) || credits <= 0 || !ref) {
        throw new Error('Invalid reversal amount');
    }
    await ensureSchemaAsync(connection);
    if (isPostgresConnection(connection)) {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const pool = resolvePostgresAsyncPool(connection);
        const existing = await queryPgPool(pool, 'SELECT id FROM ai_credit_ledger WHERE reference_id = $1', [ref]);
        if (existing.rows[0]) {
            return { duplicate: true, balance: await readBalanceAsync(connection, email), reversed: 0 };
        }
    } else {
        ensureSchemaSync(connection);
        if (connection.database.prepare('SELECT id FROM ai_credit_ledger WHERE reference_id = ?').get(ref)) {
            return { duplicate: true, balance: readBalanceSync(connection, email), reversed: 0 };
        }
    }
    const balance = await readBalanceAsync(connection, email);
    const toReverse = Math.min(credits, balance);
    if (toReverse <= 0) {
        return { duplicate: false, balance, reversed: 0, partial: true };
    }
    const result = await deductCreditsAsync(connection, {
        email,
        amount: toReverse,
        referenceId: ref,
        entryType,
        metadata: { ...metadata, reversal: true, requestedReversal: credits },
    });
    return { ...result, reversed: toReverse, partial: toReverse < credits };
}

async function findLedgerByReferenceAsync(connection, referenceId) {
    await ensureSchemaAsync(connection);
    const ref = String(referenceId || '').trim();
    if (!ref) return null;
    if (isPostgresConnection(connection)) {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const pool = resolvePostgresAsyncPool(connection);
        const result = await queryPgPool(
            pool,
            `SELECT id, email, entry_type, amount, balance_after, reference_id, metadata, created_at
             FROM ai_credit_ledger WHERE reference_id = $1`,
            [ref],
        );
        return mapLedgerRow(result.rows[0]);
    }
    ensureSchemaSync(connection);
    const row = connection.database.prepare(
        `SELECT id, email, entry_type AS entryType, amount, balance_after AS balanceAfter,
                reference_id AS referenceId, metadata, created_at AS createdAt
         FROM ai_credit_ledger WHERE reference_id = ?`,
    ).get(ref);
    return mapLedgerRow(row);
}

async function readWalletSummaryAsync(connection, email) {
    const balance = await readBalanceAsync(connection, email);
    const recent = await listLedgerAsync(connection, email, 20);
    return {
        enabled: String(process.env.AI_CREDITS_ENABLED || '').trim().toLowerCase() === 'true',
        balance,
        currencyLabel: 'credits',
        recentTransactions: recent,
    };
}

module.exports = {
    grantCreditsIdempotentAsync,
    deductCreditsAsync,
    reverseCreditsIdempotentAsync,
    findLedgerByReferenceAsync,
    listLedgerAsync,
    readBalanceAsync,
    readBalanceSync,
    readWalletSummaryAsync,
};
