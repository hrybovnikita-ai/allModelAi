async function createStripeBillingPortalUrl(stripe, { customerId, returnUrl }) {
    const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
    });
    return session.url;
}

module.exports = {
    createStripeBillingPortalUrl,
};
