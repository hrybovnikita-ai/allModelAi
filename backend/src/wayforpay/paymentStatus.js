const PAYMENT_STATUS = {
    CREATED: 'created',
    PENDING: 'pending',
    PAID: 'paid',
    DECLINED: 'declined',
    CANCELED: 'canceled',
    ERROR: 'error',
    REFUNDED: 'refunded',
};

/** Customer-facing status for order history UI. */
function mapDisplayPaymentStatus(internalStatus) {
    const key = String(internalStatus || '').toLowerCase();
    if (key === PAYMENT_STATUS.PAID) return 'successful';
    if (key === PAYMENT_STATUS.PENDING || key === PAYMENT_STATUS.CREATED) return 'pending';
    if (key === PAYMENT_STATUS.REFUNDED) return 'refunded';
    if ([PAYMENT_STATUS.DECLINED, PAYMENT_STATUS.CANCELED, PAYMENT_STATUS.ERROR].includes(key)) {
        return 'failed';
    }
    return 'pending';
}

module.exports = {
    PAYMENT_STATUS,
    mapDisplayPaymentStatus,
};
