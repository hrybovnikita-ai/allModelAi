import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkoutSource = fs.readFileSync(path.join(root, 'src/components/Checkout/Checkout.jsx'), 'utf8');
const summarySource = fs.readFileSync(path.join(root, 'src/components/Checkout/CheckoutSummaryCard.jsx'), 'utf8');
const stripeSource = fs.readFileSync(path.join(root, 'src/components/Checkout/StripeEmbeddedCheckout.jsx'), 'utf8');
const productionSource = fs.readFileSync(path.join(root, 'src/components/Checkout/ProductionStripeCheckoutForm.jsx'), 'utf8');
const billingSource = fs.readFileSync(path.join(root, 'src/components/Checkout/SubscriptionBillingFields.jsx'), 'utf8');
const layoutCss = fs.readFileSync(path.join(root, 'src/components/Checkout/CheckoutStripeLayout.css'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const chatSource = fs.readFileSync(path.join(root, 'src/components/Chat/Chat.jsx'), 'utf8');
const pricingSource = fs.readFileSync(path.join(root, 'src/components/Pricing/Pricing.jsx'), 'utf8');
const logoSource = fs.readFileSync(path.join(root, 'src/components/AllModelAILogo/AllModelAILogo.jsx'), 'utf8');

test('checkout uses Cursor-inspired two-column Stripe layout', () => {
  assert.match(checkoutSource, /CheckoutStripeLayout\.css/);
  assert.match(checkoutSource, /checkout-page--stripe-layout/);
  assert.match(checkoutSource, /checkout-layout--cursor/);
  assert.match(checkoutSource, /PaymentFormCard light=\{useStripeProduction\}/);
  assert.match(layoutCss, /payment-form-card--light/);
  assert.match(layoutCss, /grid-template-columns/);
});

test('summary shows AllModelAI dragon branding and USD totals', () => {
  assert.match(summarySource, /AllModelAILogoMark/);
  assert.match(summarySource, /Subscribe to AllModelAI/);
  assert.match(summarySource, /Total due today/);
  assert.match(summarySource, /Currency/);
  assert.match(summarySource, /USD/);
  assert.match(logoSource, /gold_dragon_allModelAi\.png/);
  assert.doesNotMatch(summarySource, /Cursor/);
});

test('Stripe payment column uses Payment Element with light appearance', () => {
  assert.match(stripeSource, /stripeCheckoutAppearanceLight/);
  assert.match(stripeSource, /PaymentElement/);
  assert.match(productionSource, /appearance=\{appearance\}/);
  assert.match(productionSource, /Payment method/);
  assert.match(checkoutSource, /appearance="light"/);
  assert.doesNotMatch(productionSource, /inputMode="numeric"[\s\S]*CVC/);
});

test('contact email can be locked to the authenticated account', () => {
  assert.match(billingSource, /emailLocked/);
  assert.match(billingSource, /readOnly=\{emailLocked\}/);
  assert.match(checkoutSource, /emailLocked=\{Boolean\(sessionUser\?\.email\)\}/);
});

test('starter pro unlimited routes and pricing amounts are wired', () => {
  assert.match(appSource, /path="\/checkout\/starter"/);
  assert.match(appSource, /path="\/checkout\/unlimited"/);
  assert.match(pricingSource, /price: '\$5'/);
  assert.match(pricingSource, /price: '\$15'/);
  assert.match(pricingSource, /price: '\$30'/);
  assert.match(pricingSource, /800 requests per month/);
  assert.match(pricingSource, /3,000 requests per month/);
  assert.match(pricingSource, /6,000 requests per month/);
});

test('chat plan cards navigate to AllModelAI checkout page', () => {
  assert.match(chatSource, /CHAT_PLAN_TO_CHECKOUT = \{ starter: 'starter', pro: 'pro', unlimited: 'unlimited' \}/);
  assert.match(chatSource, /navigate\(`\/checkout\?plan=\$\{encodeURIComponent/);
  assert.doesNotMatch(chatSource, /embedded: false, flow: 'hosted'/);
});

test('Stripe checkout never labels WayForPay as the processor', () => {
  assert.match(checkoutSource, /providerLabel = useStripeProduction[\s\S]*\? 'Stripe'/);
  assert.match(checkoutSource, /paymentProvider === 'wayforpay' && paymentsAvailable && !useStripeProduction/);
});
