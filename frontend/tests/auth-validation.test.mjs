import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistrationForm } from '../src/lib/authValidation.js';

test('registration validation requires name, email, and password', () => {
  assert.equal(validateRegistrationForm({ name: '', email: 'a@b.com', password: '12345678' }).message, 'Please enter your name.');
  assert.equal(validateRegistrationForm({ name: 'Al', email: 'bad', password: '12345678' }).message, 'Please enter a valid email address.');
  assert.equal(validateRegistrationForm({ name: 'Al', email: 'a@b.com', password: 'short' }).message, 'Password must contain at least 8 characters.');
  assert.equal(validateRegistrationForm({ name: 'Al', email: 'a@b.com', password: '' }).message, 'Please enter a password.');
});

test('registration validation normalizes email in payload', () => {
  const result = validateRegistrationForm({
    name: '  Nikita  ',
    email: '  User@Example.COM ',
    password: '12345678',
  });
  assert.equal(result.ok, true);
  assert.equal(result.payload.name, 'Nikita');
  assert.equal(result.payload.email, 'user@example.com');
  assert.equal(result.payload.password, '12345678');
  assert.equal(result.payload.confirmPassword, undefined);
});
