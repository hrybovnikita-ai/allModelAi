const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    ensureSubscriptionBillingSchema,
    migrateAllSubscriptionPlanSlugs,
} = require('../src/billing/subscriptionLifecycle');

const envSnapshot = {
    DATABASE_URL: process.env.DATABASE_URL,
};

afterEach(() => {
    if (envSnapshot.DATABASE_URL) {
        process.env.DATABASE_URL = envSnapshot.DATABASE_URL;
    } else {
        delete process.env.DATABASE_URL;
    }
    delete require.cache[require.resolve('../src/db/provider')];
    delete require.cache[require.resolve('../src/db/schemaIntrospection')];
    delete require.cache[require.resolve('../src/billing/subscriptionLifecycle')];
});

test('ensureSubscriptionBillingSchema does not run SQLite PRAGMA on PostgreSQL', () => {
    process.env.DATABASE_URL = 'postgresql://example.invalid/db';
    delete require.cache[require.resolve('../src/billing/subscriptionLifecycle')];
    const { ensureSubscriptionBillingSchema: ensureSchema } = require('../src/billing/subscriptionLifecycle');

    let prepareCalled = false;
    let execCalled = false;
    const database = {
        prepare(sql) {
            prepareCalled = true;
            if (/PRAGMA/i.test(sql)) {
                throw new Error('syntax error at or near "PRAGMA" (42601)');
            }
            return { all: () => [], get: () => undefined, run: () => ({ changes: 0 }) };
        },
        exec() {
            execCalled = true;
        },
        pragma() {
            return [{ name: 'email' }, { name: 'plan' }];
        },
    };

    assert.doesNotThrow(() => ensureSchema(database));
    assert.equal(prepareCalled, false);
    assert.equal(execCalled, false);
});

test('migrateAllSubscriptionPlanSlugs runs SELECT/UPDATE only on PostgreSQL', () => {
    process.env.DATABASE_URL = 'postgresql://example.invalid/db';
    delete require.cache[require.resolve('../src/billing/subscriptionLifecycle')];
    const { migrateAllSubscriptionPlanSlugs: migratePlans } = require('../src/billing/subscriptionLifecycle');

    const executed = [];
    const database = {
        prepare(sql) {
            executed.push(String(sql).trim());
            if (/PRAGMA/i.test(sql)) {
                throw new Error('42601 syntax error at or near "PRAGMA"');
            }
            return {
                all: () => [{
                    email: 'user@test.com',
                    plan: 'common',
                    requestLimit: 3000,
                }],
                run: () => ({ changes: 1 }),
            };
        },
        pragma() {
            return [{ name: 'email' }, { name: 'plan' }];
        },
    };

    const appDb = {
        database,
        read: () => ({ subscriptions: { 'user@test.com': 'common' } }),
        write: () => {},
    };

    const updated = migratePlans(appDb);
    assert.ok(updated >= 0);
    assert.ok(executed.every((sql) => !/PRAGMA/i.test(sql)));
    assert.ok(executed.some((sql) => sql.startsWith('SELECT email, plan')));
});

test('ensureSubscriptionBillingSchema uses pragma on SQLite for additive columns', () => {
    delete process.env.DATABASE_URL;
    delete require.cache[require.resolve('../src/billing/subscriptionLifecycle')];
    const { ensureSubscriptionBillingSchema: ensureSchema } = require('../src/billing/subscriptionLifecycle');

    const execCalls = [];
    const database = {
        pragma(command) {
            assert.match(command, /table_info\(subscription_details\)/);
            return [{ name: 'email' }, { name: 'plan' }];
        },
        exec(sql) {
            execCalls.push(sql);
        },
    };

    ensureSchema(database);
    assert.ok(execCalls.some((sql) => sql.includes('ADD COLUMN payment_provider')));
});
