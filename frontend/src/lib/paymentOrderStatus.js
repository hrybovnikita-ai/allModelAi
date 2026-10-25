export function formatPaymentOrderStatus(displayStatus, internalStatus) {
  const key = String(displayStatus || internalStatus || '').toLowerCase();
  if (key === 'successful' || key === 'paid') return 'Successful';
  if (key === 'pending' || key === 'created') return 'Pending';
  if (key === 'refunded') return 'Refunded';
  if (key === 'failed' || key === 'declined' || key === 'canceled' || key === 'error') return 'Failed';
  return 'Pending';
}

export function paymentStatusClass(displayStatus, internalStatus) {
  const label = formatPaymentOrderStatus(displayStatus, internalStatus);
  if (label === 'Successful') return 'paid';
  if (label === 'Failed' || label === 'Refunded') return 'failed';
  return 'pending';
}
