const test = require('node:test');
const assert = require('node:assert/strict');
const {
    stripeCheckoutWalletOptions,
    hostnameFromOrigin,
} = require('../src/stripeWallet');

test('stripeCheckoutWalletOptions enables Apple Pay and Google Pay wallets', () => {
    const options = stripeCheckoutWalletOptions();
    assert.equal(options.wallet_options.apple_pay.enabled, true);
    assert.equal(options.wallet_options.google_pay.enabled, true);
});

test('hostnameFromOrigin skips localhost', () => {
    assert.equal(hostnameFromOrigin('http://localhost:5173'), null);
    assert.equal(hostnameFromOrigin('https://app.example.com'), 'app.example.com');
});
