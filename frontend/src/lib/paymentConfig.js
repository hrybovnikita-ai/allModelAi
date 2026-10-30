import apiClient from './apiClient';

/** Authenticated payment + Stripe publishable key (server is source of truth). */
export async function fetchPaymentConfig() {
  const response = await apiClient.get('/api/payments/config');
  return response.data;
}
