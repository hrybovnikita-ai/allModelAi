const { subscriptionPlans, periodEndFor, normalizePlanKey, planStorageValue } = require('./plans');
const { ensureSubscriptionBillingSchema } = require('./subscriptionLifecycle');
const { logSubscription } = require('./paymentLogger');

const activateSubscription = (database, {
    email,
    name = 'Subscriber',
    city = '',
    dateOfBirth = '',
    planKey,
    stripeCustomerId = null,
    stripeSubscriptionId = null,
    paymentProvider = null,
    orderReference = null,
    paymentStatus = 'successful',
    amount = null,
    currency = null,
    isTestPayment = false,
}) => {
    const normalizedPlanKey = normalizePlanKey(planKey);
    const plan = subscriptionPlans[normalizedPlanKey];
    if (!plan) throw new Error('Unknown subscription plan');
    planKey = normalizedPlanKey;
    ensureSubscriptionBillingSchema(database.database);
    const normalizedEmail = String(email).trim().toLowerCase();
    const data = database.read();
    data.subscriptions ||= {};
    data.usage ||= {};
    data.purchases ||= [];
    const purchase = {
        id: data.purchases.length ? Math.max(...data.purchases.map((item) => item.id)) + 1 : 1,
        plan: planKey,
        name: String(name).trim(),
        email: normalizedEmail,
        city: String(city).trim(),
        dateOfBirth: String(dateOfBirth),
        createdAt: new Date().toISOString(),
    };
    data.purchases.push(purchase);
    data.subscriptions[normalizedEmail] = planKey;
    data.usage[normalizedEmail] = 0;
    database.write(data);
    const activatedAt = new Date().toISOString();
    const periodEnd = periodEndFor(plan.interval);
    const storedPlan = planStorageValue(planKey);
    database.database.prepare(`
        INSERT INTO subscription_details (
            email, plan, billing_interval, request_limit, period_end,
            stripe_customer_id, stripe_subscription_id, status, updated_at,
            payment_provider, order_reference, payment_status, amount, currency, activated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
            plan = excluded.plan,
            billing_interval = excluded.billing_interval,
            request_limit = excluded.request_limit,
            period_end = excluded.period_end,
            stripe_customer_id = excluded.stripe_customer_id,
            stripe_subscription_id = excluded.stripe_subscription_id,
            status = 'active',
            updated_at = excluded.updated_at,
            payment_provider = excluded.payment_provider,
            order_reference = excluded.order_reference,
            payment_status = excluded.payment_status,
            amount = excluded.amount,
            currency = excluded.currency,
            activated_at = excluded.activated_at
    `).run(
        normalizedEmail,
        storedPlan,
        plan.interval,
        plan.limit,
        periodEnd,
        stripeCustomerId,
        stripeSubscriptionId,
        activatedAt,
        paymentProvider,
        orderReference,
        paymentStatus,
        amount,
        currency,
        activatedAt,
    );
    logSubscription(`${plan.name} activated`, {
        email: normalizedEmail,
        plan: planKey,
        orderReference,
        paymentProvider,
        test: isTestPayment,
        expiresAt: periodEnd,
    });
    return purchase;
};

module.exports = { activateSubscription };
