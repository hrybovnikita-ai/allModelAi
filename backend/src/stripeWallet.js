const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const hostnameFromOrigin = (origin) => {
    try {
        const hostname = new URL(origin).hostname;
        return hostname && !LOCAL_HOSTS.has(hostname) ? hostname : null;
    } catch {
        return null;
    }
};

/** Stripe Checkout session flags for Apple Pay, Google Pay, and Link on subscriptions. */
const stripeCheckoutWalletOptions = () => ({
    wallet_options: {
        apple_pay: { enabled: true },
        google_pay: { enabled: true },
    },
});

/**
 * Registers the app hostname with Stripe so Apple Pay / Google Pay can appear in Checkout.
 * Apple Pay also requires hosting the domain verification file under /.well-known/ on the site.
 */
const ensureStripePaymentMethodDomain = async (stripe, origin) => {
    const fromEnv = process.env.STRIPE_PAYMENT_DOMAIN?.trim();
    const hostname = fromEnv || hostnameFromOrigin(origin);
    if (!hostname) return;

    try {
        const listed = await stripe.paymentMethodDomains.list({ limit: 100 });
        const known = new Set(listed.data.map((row) => row.domain_name));
        if (!known.has(hostname)) {
            await stripe.paymentMethodDomains.create({ domain_name: hostname });
        }
    } catch (error) {
        console.warn('[stripe] payment method domain registration failed:', error.message);
    }
};

module.exports = {
    stripeCheckoutWalletOptions,
    ensureStripePaymentMethodDomain,
    hostnameFromOrigin,
};
