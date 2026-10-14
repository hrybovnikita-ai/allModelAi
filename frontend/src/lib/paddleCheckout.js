import { initializePaddle } from '@paddle/paddle-js';

let paddlePromise = null;

export async function getPaddleCheckout({ clientToken, sandbox = true }) {
  const token = String(clientToken || '').trim();
  if (!token) {
    throw new Error('Paddle client token is not configured.');
  }
  if (!paddlePromise) {
    paddlePromise = initializePaddle({
      token,
      environment: sandbox ? 'sandbox' : 'production',
      checkout: {
        settings: {
          displayMode: 'overlay',
          theme: 'dark',
          locale: 'en',
        },
      },
    });
  }
  const instance = await paddlePromise;
  if (!instance) {
    throw new Error('Paddle checkout could not initialize.');
  }
  return instance;
}

export async function openPaddleCheckout({ clientToken, sandbox, transactionId }) {
  const paddle = await getPaddleCheckout({ clientToken, sandbox });
  const txn = String(transactionId || '').trim();
  if (!txn) throw new Error('Missing Paddle transaction id.');
  if (typeof paddle.Checkout?.open === 'function') {
    paddle.Checkout.open({ transactionId: txn });
    return;
  }
  throw new Error('Paddle Checkout API is unavailable in this browser.');
}
